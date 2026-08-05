import { encodePublishReport } from '../../../packages/proof/src/registry.js';
import { checksumAddress, DEFAULT_PROOF_NETWORK, resolveProofNetwork } from '../../../packages/proof/v4/network.js';
import { canonicalJson, cloneValue, deepFreeze, sha256Digest } from './canonical.js';
import { webV4Error } from './errors.js';
import { verifyV4Report } from './report-adapter.js';

export const WEB_PROOF_ENVELOPE_VERSION = 'veilforge.proof.v4.1';
export const WEB_PROOF_ADAPTER_VERSION = '1.0.0';
export const REGISTRY_METHOD = 'publishReport(bytes32,bytes32,bytes32,uint16,string,string)';
const REQUIRED = Object.freeze([
  'envelopeVersion', 'product', 'productVersion', 'reportSchemaVersion', 'reportHashPayloadVersion',
  'reportHash', 'reportIntegrityStatus', 'projectId', 'sourceManifestDigest', 'scanDomainSummary',
  'findingSummary', 'complete', 'incompleteReasonCodes', 'policyStatus', 'compilerVersion',
  'analyzerVersion', 'chainId', 'networkKey', 'registryAddress', 'registryContractVersion',
  'createdAtOperational', 'canonicalPayloadDigest', 'transactionIdentity',
]);
const ALLOWED = new Set(REQUIRED);
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const TX_HASH = /^0x[0-9a-f]{64}$/u;

const fail = (code, message) => { throw webV4Error(code, message); };
const sortedRecord = (value = {}) => Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
const digestHex = (value, field) => {
  const match = /^sha256:([0-9a-f]{64})$/u.exec(String(value ?? ''));
  if (!match) fail('WEB_V4_TX_INVALID', `${field} is not a valid report digest.`);
  return `0x${match[1]}`;
};
const envelopePayload = (envelope) => {
  const value = cloneValue(envelope);
  delete value.createdAtOperational;
  delete value.canonicalPayloadDigest;
  delete value.transactionIdentity;
  return value;
};

function reasonCodes(report) {
  return [...new Set((report.analysis?.incompleteReasons ?? []).map((reason) => String(
    typeof reason === 'string' ? reason : reason?.code ?? reason?.reasonCode ?? reason?.kind ?? '',
  ).trim()).filter(Boolean))].sort();
}

function findingSummary(report) {
  return {
    total: report.summary.totalFindings,
    active: report.summary.activeDetected,
    bySeverity: sortedRecord(report.summary.severityCounts),
    byDomain: sortedRecord(report.summary.domainCounts),
    policyApproved: report.summary.policyApproved,
    acceptedRisk: report.summary.acceptedRisk,
    incomplete: report.summary.incomplete,
  };
}

export async function createWebProofEnvelope(verification, { networkKey = DEFAULT_PROOF_NETWORK } = {}) {
  if (verification?.verified !== true || !verification.report) fail('WEB_V4_REPORT_UNVERIFIED', 'A verified V4 report is required.');
  const verified = await verifyV4Report(verification.report);
  if (verified.reportHash !== verification.reportHash) fail('WEB_V4_REPORT_UNVERIFIED', 'The verified report binding is inconsistent.');
  const report = verified.report;
  const network = resolveProofNetwork(networkKey);
  const incompleteReasonCodes = reasonCodes(report);
  if (report.analysis.complete === false && !incompleteReasonCodes.length) fail('WEB_V4_PROOF_ENVELOPE_INVALID', 'Incomplete proof reason codes are required.');
  const envelope = {
    envelopeVersion: WEB_PROOF_ENVELOPE_VERSION,
    product: report.scanner.name,
    productVersion: report.scanner.version,
    reportSchemaVersion: report.schemaVersion,
    reportHashPayloadVersion: report.integrity.hashPayloadVersion,
    reportHash: report.integrity.reportHash,
    reportIntegrityStatus: 'verified',
    projectId: report.project.projectId,
    sourceManifestDigest: report.inputs.sourceManifestDigest,
    scanDomainSummary: [...new Set(report.project.domainHints ?? [])].sort(),
    findingSummary: findingSummary(report),
    complete: report.analysis.complete,
    incompleteReasonCodes,
    policyStatus: report.policy.evaluationStatus,
    compilerVersion: report.compiler.version,
    analyzerVersion: report.scanner.engineVersion,
    chainId: network.chainId,
    networkKey: network.networkKey,
    registryAddress: network.registryAddress,
    registryContractVersion: network.registryContractVersion,
    createdAtOperational: null,
    canonicalPayloadDigest: null,
    transactionIdentity: null,
  };
  envelope.canonicalPayloadDigest = await sha256Digest(envelopePayload(envelope));
  return deepFreeze(envelope);
}

export async function verifyWebProofEnvelope(envelope, { verification } = {}) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) fail('WEB_V4_PROOF_ENVELOPE_INVALID', 'The proof envelope is invalid.');
  if (REQUIRED.some((key) => !Object.hasOwn(envelope, key)) || Object.keys(envelope).some((key) => !ALLOWED.has(key))) fail('WEB_V4_PROOF_ENVELOPE_INVALID', 'The proof envelope shape is invalid.');
  const network = resolveProofNetwork(envelope.networkKey);
  const valid = envelope.envelopeVersion === WEB_PROOF_ENVELOPE_VERSION
    && envelope.reportSchemaVersion === '4.1.0'
    && envelope.reportHashPayloadVersion === 'veilforge.report.hash.v2'
    && envelope.reportIntegrityStatus === 'verified'
    && envelope.compilerVersion === '0.8.24'
    && envelope.chainId === network.chainId
    && String(envelope.registryAddress).toLowerCase() === network.registryAddress.toLowerCase()
    && envelope.registryContractVersion === network.registryContractVersion
    && DIGEST.test(envelope.reportHash)
    && DIGEST.test(envelope.sourceManifestDigest)
    && typeof envelope.complete === 'boolean'
    && Array.isArray(envelope.incompleteReasonCodes)
    && (envelope.complete ? envelope.incompleteReasonCodes.length === 0 : envelope.incompleteReasonCodes.length > 0)
    && envelope.canonicalPayloadDigest === await sha256Digest(envelopePayload(envelope));
  if (!valid) fail('WEB_V4_PROOF_ENVELOPE_INVALID', 'The proof envelope failed verification.');
  if (verification) {
    const expected = await createWebProofEnvelope(verification, { networkKey: envelope.networkKey });
    if (expected.canonicalPayloadDigest !== envelope.canonicalPayloadDigest) fail('WEB_V4_PROOF_ENVELOPE_INVALID', 'The proof envelope does not match the verified report.');
  }
  return true;
}

async function registryPayload(envelope, reportURI = '') {
  if (typeof reportURI !== 'string' || reportURI.length > 512) fail('WEB_V4_TX_INVALID', 'The report URI is invalid.');
  const projectDigest = await sha256Digest({ namespace: 'veilforge.registry.project.v1', projectId: String(envelope.projectId).normalize('NFC').trim() });
  return {
    projectId: digestHex(projectDigest, 'projectId'),
    sourceHash: digestHex(envelope.sourceManifestDigest, 'sourceManifestDigest'),
    reportHash: digestHex(envelope.reportHash, 'reportHash'),
    score: 0,
    scannerVersion: `${envelope.productVersion}|report:${envelope.reportSchemaVersion}|hash:v2|proof:4.1`,
    reportURI,
  };
}

export async function createWebRegistryPayload(envelope, reportURI = '') {
  await verifyWebProofEnvelope(envelope);
  return deepFreeze(await registryPayload(envelope, reportURI));
}

function matchingRecord(record, payload, account) {
  if (!record) return false;
  return String(record.sourceHash).toLowerCase() === payload.sourceHash
    && String(record.reportHash).toLowerCase() === payload.reportHash
    && Number(record.score) === 0
    && record.scannerVersion === payload.scannerVersion
    && String(record.publisher).toLowerCase() === account.toLowerCase();
}

function safeExistingTransactionIdentity(identity, envelope, network, account) {
  if (identity === null) return null;
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', 'The existing transaction identity is invalid.');
  const allowed = new Set(['chainId', 'networkKey', 'registryAddress', 'registryContractVersion', 'transactionHash', 'blockNumber', 'publisher', 'reportHash', 'status', 'explorerUrl']);
  const transactionHash = String(identity.transactionHash ?? '').toLowerCase();
  const valid = Object.keys(identity).every((key) => allowed.has(key))
    && identity.chainId === network.chainId
    && identity.networkKey === network.networkKey
    && String(identity.registryAddress ?? '').toLowerCase() === network.registryAddress.toLowerCase()
    && identity.registryContractVersion === network.registryContractVersion
    && TX_HASH.test(transactionHash)
    && Number.isSafeInteger(identity.blockNumber) && identity.blockNumber >= 0
    && String(identity.publisher ?? '').toLowerCase() === account.toLowerCase()
    && identity.reportHash === envelope.reportHash
    && identity.status === 'confirmed'
    && identity.explorerUrl === `${network.explorerBaseUrl}/tx/${transactionHash}`;
  if (!valid) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', 'The existing transaction identity conflicts with this proof.');
  return cloneValue({ ...identity, transactionHash });
}

export async function prepareWebRegistryPublish({ verification, envelope, walletState, disclosureAcknowledged = false, existingRecord = null, existingTransactionIdentity = null, reportURI = '' } = {}) {
  const checks = [];
  const check = (id, passed, message, severity = 'blocking') => { checks.push(deepFreeze({ id, passed, severity, message })); return passed; };
  const reportVerified = verification?.verified === true;
  check('report-verified', reportVerified, reportVerified ? 'Verified V4 report is bound.' : 'Verified V4 report is required.');
  if (!reportVerified) return deepFreeze({ status: 'report-unverified', checks, blockingReasons: ['report-unverified'], warnings: [], transactionRequest: null });
  let envelopeVerified = false;
  try { envelopeVerified = await verifyWebProofEnvelope(envelope, { verification }); } catch { /* fail closed below */ }
  check('envelope-verified', envelopeVerified, envelopeVerified ? 'Proof envelope is verified.' : 'Proof envelope verification failed.');
  const disclosed = envelopeVerified && (envelope.complete || disclosureAcknowledged === true);
  check('incomplete-disclosure', disclosed, disclosed ? 'Completeness disclosure accepted.' : 'Acknowledge the incomplete analysis before preflight.');
  const providerAvailable = walletState?.providerAvailable === true;
  const accountAvailable = walletState?.connected === true && Boolean(walletState.account);
  check('provider-available', providerAvailable, providerAvailable ? 'Injected EVM provider is available.' : 'Wallet provider is unavailable.');
  check('account-available', accountAvailable, accountAvailable ? 'A wallet account is available.' : 'No wallet account is available.');
  const network = resolveProofNetwork(envelope?.networkKey ?? DEFAULT_PROOF_NETWORK);
  const chainMatches = walletState?.chainId === network.chainId;
  check('chain-matches', chainMatches, chainMatches ? 'Wallet chain matches Arc Testnet.' : 'Wallet is on the wrong network.');
  const registryMatches = String(envelope?.registryAddress ?? '').toLowerCase() === network.registryAddress.toLowerCase();
  check('registry-matches', registryMatches, registryMatches ? 'Trusted Registry V2 is selected.' : 'Registry does not match trusted configuration.');
  const blockingReasons = checks.filter((item) => !item.passed && item.severity === 'blocking').map((item) => item.id);
  const warnings = envelopeVerified && !envelope.complete ? ['incomplete-analysis', ...envelope.incompleteReasonCodes] : [];
  if (blockingReasons.length) return deepFreeze({ status: blockingReasons.includes('chain-matches') ? 'wrong-network' : 'preflight-failed', checks, blockingReasons, warnings, transactionRequest: null });
  let account;
  try { account = checksumAddress(walletState.account, 'account'); } catch { fail('WEB_V4_ACCOUNT_UNAVAILABLE', 'The wallet account is invalid.'); }
  const payload = await registryPayload(envelope, reportURI);
  if (existingRecord) {
    if (!matchingRecord(existingRecord, payload, account)) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', 'The existing registry record conflicts with this proof.');
    const transactionIdentity = safeExistingTransactionIdentity(existingTransactionIdentity, envelope, network, account);
    check('duplicate-record', true, 'An identical publisher-scoped record already exists.', 'warning');
    return deepFreeze({ status: 'already-published', checks, blockingReasons: [], warnings: ['duplicate-publication', ...warnings], payload, transactionRequest: null, transactionIdentity });
  }
  const data = encodePublishReport(payload);
  const transactionRequest = {
    from: account,
    to: network.registryAddress,
    chainId: network.chainIdHex,
    data,
    value: '0x0',
  };
  JSON.stringify(transactionRequest);
  check('transaction-safe', data.length <= 8194, 'Deterministic Registry V2 transaction request is prepared.');
  return deepFreeze({
    status: 'ready-to-publish', checks, blockingReasons: [], warnings, payload,
    transactionRequest,
    transactionSummary: {
      from: account, to: network.registryAddress, chainId: network.chainId,
      value: '0x0', reportHash: envelope.reportHash, registryMethod: REGISTRY_METHOD,
      calldataBytes: (data.length - 2) / 2, gasEstimateStatus: 'not-requested', duplicatePolicy: 'publisher-scoped-idempotent',
    },
    transactionIdentity: null,
  });
}

export function safeTransactionRequest(request, networkKey = DEFAULT_PROOF_NETWORK) {
  const network = resolveProofNetwork(networkKey);
  if (!request || String(request.to).toLowerCase() !== network.registryAddress.toLowerCase()
    || request.chainId.toLowerCase() !== network.chainIdHex
    || request.value !== '0x0' || !/^0x[0-9a-f]+$/u.test(request.data)
    || !/^0x[0-9a-fA-F]{40}$/u.test(request.from)) fail('WEB_V4_TX_INVALID', 'The transaction request is unsafe.');
  const value = cloneValue(request);
  canonicalJson(value);
  return deepFreeze(value);
}
