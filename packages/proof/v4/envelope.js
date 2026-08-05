import { HASH_PAYLOAD_VERSION } from '../../analyzer/src/v4/report/report-hash.js';
import { assertSourceFree, proofDigest, withoutOperationalFields } from './canonical.js';
import { proofError } from './errors.js';
import { DEFAULT_PROOF_NETWORK, resolveProofNetwork } from './network.js';
import { incompleteReasonCodes, verifyV4ReportForProof } from './verify.js';

export const PROOF_ENVELOPE_VERSION = 'veilforge.proof.v4.1';

const REQUIRED = Object.freeze([
  'envelopeVersion', 'product', 'productVersion', 'reportSchemaVersion', 'reportHashPayloadVersion',
  'reportHash', 'reportIntegrityStatus', 'projectId', 'sourceManifestDigest', 'scanDomainSummary',
  'findingSummary', 'complete', 'incompleteReasonCodes', 'policyStatus', 'compilerVersion',
  'analyzerVersion', 'chainId', 'networkKey', 'registryAddress', 'registryContractVersion',
  'createdAtOperational', 'canonicalPayloadDigest', 'transactionIdentity',
]);
const ALLOWED = new Set(REQUIRED);

function sortedRecord(record = {}) {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

function reportFindingSummary(report) {
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

function validOperationalTimestamp(value) {
  return value === null || (typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)));
}

function validTransactionIdentity(identity, envelope, network) {
  if (identity === null) return true;
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) return false;
  const allowed = new Set(['chainId', 'networkKey', 'registryAddress', 'registryContractVersion', 'transactionHash', 'blockNumber', 'publisher', 'reportHash', 'status', 'explorerUrl']);
  if (Object.keys(identity).some((key) => !allowed.has(key))) return false;
  return identity.chainId === network.chainId
    && identity.networkKey === network.networkKey
    && String(identity.registryAddress).toLowerCase() === network.registryAddress.toLowerCase()
    && identity.registryContractVersion === network.registryContractVersion
    && /^0x[0-9a-f]{64}$/u.test(identity.transactionHash)
    && Number.isSafeInteger(identity.blockNumber) && identity.blockNumber >= 0
    && /^0x[0-9a-fA-F]{40}$/u.test(identity.publisher)
    && identity.reportHash === envelope.reportHash
    && identity.status === 'confirmed'
    && identity.explorerUrl === `${network.explorerBaseUrl}/tx/${identity.transactionHash}`;
}

export function envelopePayload(envelope) {
  return withoutOperationalFields(envelope);
}

export function createV4ProofEnvelope(report, { networkKey = DEFAULT_PROOF_NETWORK, createdAtOperational = null } = {}) {
  const verified = verifyV4ReportForProof(report);
  const network = resolveProofNetwork(networkKey);
  if (!validOperationalTimestamp(createdAtOperational)) {
    throw proofError('PROOF_ENVELOPE_INVALID', { field: 'createdAtOperational' });
  }
  const envelope = {
    envelopeVersion: PROOF_ENVELOPE_VERSION,
    product: verified.scanner.name,
    productVersion: verified.scanner.version,
    reportSchemaVersion: verified.schemaVersion,
    reportHashPayloadVersion: HASH_PAYLOAD_VERSION,
    reportHash: verified.integrity.reportHash,
    reportIntegrityStatus: 'verified',
    projectId: verified.project.projectId,
    sourceManifestDigest: verified.inputs.sourceManifestDigest,
    scanDomainSummary: [...new Set(verified.project.domainHints ?? [])].sort(),
    findingSummary: reportFindingSummary(verified),
    complete: verified.analysis.complete,
    incompleteReasonCodes: incompleteReasonCodes(verified),
    policyStatus: verified.policy.evaluationStatus,
    compilerVersion: verified.compiler.version,
    analyzerVersion: verified.scanner.engineVersion,
    chainId: network.chainId,
    networkKey: network.networkKey,
    registryAddress: network.registryAddress,
    registryContractVersion: network.registryContractVersion,
    createdAtOperational,
    canonicalPayloadDigest: null,
    transactionIdentity: null,
  };
  envelope.canonicalPayloadDigest = proofDigest(envelopePayload(envelope));
  assertSourceFree(envelope);
  return Object.freeze(envelope);
}

export function verifyV4ProofEnvelope(envelope, { report } = {}) {
  let candidate;
  try { candidate = structuredClone(envelope); } catch { throw proofError('PROOF_ENVELOPE_INVALID'); }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw proofError('PROOF_ENVELOPE_INVALID');
  for (const key of REQUIRED) if (!Object.hasOwn(candidate, key)) throw proofError('PROOF_ENVELOPE_INVALID', { field: key });
  for (const key of Object.keys(candidate)) if (!ALLOWED.has(key)) throw proofError('PROOF_ENVELOPE_INVALID', { field: key });
  assertSourceFree(candidate);
  const network = resolveProofNetwork(candidate.networkKey);
  const basic = candidate.envelopeVersion === PROOF_ENVELOPE_VERSION
    && candidate.reportSchemaVersion === '4.1.0'
    && candidate.reportHashPayloadVersion === HASH_PAYLOAD_VERSION
    && candidate.reportIntegrityStatus === 'verified'
    && candidate.compilerVersion === '0.8.24'
    && candidate.chainId === network.chainId
    && String(candidate.registryAddress).toLowerCase() === network.registryAddress.toLowerCase()
    && candidate.registryContractVersion === network.registryContractVersion
    && /^sha256:[0-9a-f]{64}$/u.test(candidate.reportHash)
    && /^sha256:[0-9a-f]{64}$/u.test(candidate.sourceManifestDigest)
    && typeof candidate.complete === 'boolean'
    && Array.isArray(candidate.incompleteReasonCodes)
    && (candidate.complete ? candidate.incompleteReasonCodes.length === 0 : candidate.incompleteReasonCodes.length > 0)
    && validOperationalTimestamp(candidate.createdAtOperational)
    && validTransactionIdentity(candidate.transactionIdentity, candidate, network)
    && candidate.canonicalPayloadDigest === proofDigest(envelopePayload(candidate));
  if (!basic) throw proofError('PROOF_ENVELOPE_INVALID');
  if (report) {
    const expected = createV4ProofEnvelope(report, { networkKey: candidate.networkKey, createdAtOperational: candidate.createdAtOperational });
    if (expected.canonicalPayloadDigest !== candidate.canonicalPayloadDigest) throw proofError('PROOF_ENVELOPE_INVALID', { reason: 'report-mismatch' });
  }
  return true;
}

export function attachRegistryTransaction(envelope, transactionIdentity) {
  verifyV4ProofEnvelope(envelope);
  const candidate = structuredClone(envelope);
  candidate.transactionIdentity = structuredClone(transactionIdentity);
  verifyV4ProofEnvelope(candidate);
  return Object.freeze(candidate);
}
