import { functionSelector } from '../../../packages/analyzer/src/keccak.js';
import { PUBLISH_REPORT_SELECTOR } from '../../../packages/proof/src/registry.js';
import { checksumAddress, DEFAULT_PROOF_NETWORK, normalizeChainId, resolveProofNetwork } from '../../../packages/proof/v4/network.js';
import { cloneValue, deepFreeze, sha256Digest } from './canonical.js';
import { safeTransactionRequest, verifyWebProofEnvelope } from './proof-adapter.js';
import { webV4Error } from './errors.js';

export const WEB_PROOF_READ_ONLY_METHODS = Object.freeze([
  'eth_chainId', 'eth_getCode', 'eth_call', 'eth_estimateGas', 'eth_blockNumber',
]);
export const REGISTRY_HAS_REPORT_SELECTOR = functionSelector('hasReport(bytes32,address)');
export const REGISTRY_GET_LATEST_REPORT_SELECTOR = functionSelector('getLatestReport(bytes32,address)');

const READ_ONLY = new Set(WEB_PROOF_READ_ONLY_METHODS);
const HEX = /^0x[0-9a-f]*$/u;
const WORD = /^0x[0-9a-f]{64}$/u;
const fail = (code, message, safeDetails) => { throw webV4Error(code, message, safeDetails); };
const word = (value) => String(value).replace(/^0x/iu, '').toLowerCase().padStart(64, '0');

export async function boundedReadOnlyRequest(provider, request, { timeoutMs = 5_000 } = {}) {
  if (!provider?.request) fail('WEB_V4_PROVIDER_UNAVAILABLE', 'No EIP-1193 provider is available.');
  if (!READ_ONLY.has(request?.method)) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', 'The requested provider method is not read-only.');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 30_000) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', 'The provider timeout is invalid.');
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => provider.request(cloneValue(request))),
      new Promise((_, reject) => { timer = setTimeout(() => reject(webV4Error('WEB_V4_TIMEOUT', 'The read-only provider request timed out.')), timeoutMs); }),
    ]);
  } catch (error) {
    if (error?.code === 'WEB_V4_TIMEOUT') throw error;
    throw webV4Error('WEB_V4_PROOF_PREFLIGHT_FAILED', 'The read-only provider request failed.');
  } finally { clearTimeout(timer); }
}

function safeHex(value, field, { maxBytes = 32_768, wordOnly = false } = {}) {
  const normalized = String(value ?? '').toLowerCase();
  if (!(wordOnly ? WORD : HEX).test(normalized) || (normalized.length - 2) / 2 > maxBytes) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', `${field} returned invalid data.`);
  return normalized;
}

function registryCallData(selector, projectId, account) {
  return `${selector}${word(projectId)}${word(account)}`;
}

export function invalidateNetworkPreflight(previous, reason = 'provider-state-changed') {
  return deepFreeze({ status: 'invalidated', passed: false, reason, previousStateBindingDigest: previous?.stateBindingDigest ?? null });
}

export async function preflightArcTestnetProvider({ provider, envelope, transactionRequest, payload, timeoutMs = 5_000 } = {}) {
  await verifyWebProofEnvelope(envelope);
  const network = resolveProofNetwork(envelope.networkKey ?? DEFAULT_PROOF_NETWORK);
  const request = safeTransactionRequest(transactionRequest, network.networkKey);
  let account;
  try { account = checksumAddress(request.from, 'account'); } catch { fail('WEB_V4_ACCOUNT_UNAVAILABLE', 'The transaction account is invalid.'); }
  if (!payload || !/^0x[0-9a-f]{64}$/u.test(payload.projectId)) fail('WEB_V4_TX_INVALID', 'The registry project identity is invalid.');

  const checks = [];
  const check = (id, passed, message, severity = 'blocking') => { checks.push(deepFreeze({ id, passed, message, severity })); return passed; };
  let chainId;
  try { chainId = normalizeChainId(await boundedReadOnlyRequest(provider, { method: 'eth_chainId' }, { timeoutMs })); }
  catch (error) {
    check('provider-chain-readable', false, error?.code === 'WEB_V4_TIMEOUT' ? 'Provider chain read timed out.' : 'Provider chain could not be read.');
    return deepFreeze({ status: 'preflight-failed', passed: false, checks, blockingReasons: ['provider-chain-readable'], warnings: [], stateBindingDigest: null });
  }
  check('provider-chain-readable', true, 'Provider chain ID is readable.');
  const chainMatches = chainId === network.chainId;
  check('chain-matches', chainMatches, chainMatches ? 'Provider is on trusted Arc Testnet.' : 'Provider is on the wrong chain.');
  if (!chainMatches) return deepFreeze({ status: 'wrong-network', passed: false, checks, blockingReasons: ['chain-matches'], warnings: [], chainId, expectedChainId: network.chainId, stateBindingDigest: null });

  const code = safeHex(await boundedReadOnlyRequest(provider, { method: 'eth_getCode', params: [network.registryAddress, 'latest'] }, { timeoutMs }), 'Registry bytecode');
  const codePresent = code !== '0x' && !/^0x0+$/u.test(code);
  check('registry-code-present', codePresent, codePresent ? 'Trusted Registry V2 runtime bytecode is present.' : 'Trusted registry has no runtime bytecode.');
  const selectorCompatible = codePresent && code.includes(PUBLISH_REPORT_SELECTOR.slice(2).toLowerCase());
  check('registry-selector-compatible', selectorCompatible, selectorCompatible ? 'Registry runtime exposes the expected publish selector.' : 'Registry publish selector was not found in runtime bytecode.');
  if (!codePresent || !selectorCompatible) {
    return deepFreeze({ status: 'preflight-failed', passed: false, checks, blockingReasons: [codePresent ? 'registry-selector-compatible' : 'registry-code-present'], warnings: [], chainId, expectedChainId: network.chainId, registryAddress: network.registryAddress, stateBindingDigest: null });
  }

  const blockHex = safeHex(await boundedReadOnlyRequest(provider, { method: 'eth_blockNumber' }, { timeoutMs }), 'Block number', { wordOnly: false, maxBytes: 32 });
  const blockNumber = normalizeChainId(blockHex);
  const callBase = { to: network.registryAddress, from: account };
  const hasReportData = registryCallData(REGISTRY_HAS_REPORT_SELECTOR, payload.projectId, account);
  const hasReportResult = safeHex(await boundedReadOnlyRequest(provider, { method: 'eth_call', params: [{ ...callBase, data: hasReportData }, 'latest'] }, { timeoutMs }), 'Duplicate lookup', { wordOnly: true });
  const duplicate = BigInt(hasReportResult) !== 0n;
  check('duplicate-lookup', true, duplicate ? 'A publisher-scoped registry record already exists.' : 'No publisher-scoped registry record exists.', duplicate ? 'warning' : 'blocking');
  const latestData = registryCallData(REGISTRY_GET_LATEST_REPORT_SELECTOR, payload.projectId, account);
  const latestRecordRaw = safeHex(await boundedReadOnlyRequest(provider, { method: 'eth_call', params: [{ ...callBase, data: latestData }, 'latest'] }, { timeoutMs }), 'Registry state', { maxBytes: 8_192 });
  const registryRecordDigest = await sha256Digest(latestRecordRaw);

  let simulationPassed = false;
  try {
    safeHex(await boundedReadOnlyRequest(provider, { method: 'eth_call', params: [request, 'latest'] }, { timeoutMs }), 'Publish simulation', { maxBytes: 8_192 });
    simulationPassed = true;
  } catch { /* represented as a blocking check */ }
  check('publish-simulation', simulationPassed, simulationPassed ? 'Read-only publish simulation succeeded.' : 'Read-only publish simulation failed.');

  let gasEstimate = null;
  let gasEstimateStatus = 'unavailable';
  try {
    const estimate = safeHex(await boundedReadOnlyRequest(provider, { method: 'eth_estimateGas', params: [request] }, { timeoutMs }), 'Gas estimate', { maxBytes: 32 });
    const value = BigInt(estimate);
    if (value > 0n) { gasEstimate = `0x${value.toString(16)}`; gasEstimateStatus = 'estimated'; }
  } catch { /* an unavailable estimate is honest and non-blocking */ }
  check('gas-estimate', gasEstimateStatus === 'estimated', gasEstimateStatus === 'estimated' ? 'Read-only gas estimate is available.' : 'Gas estimate is unavailable; no value was invented.', 'warning');
  const valueValid = request.value === '0x0';
  check('transaction-value', valueValid, valueValid ? 'Registry transaction value is exactly zero.' : 'Registry transaction value is invalid.');
  const explorerSafe = network.explorerBaseUrl === 'https://testnet.arcscan.app';
  check('explorer-safe', explorerSafe, explorerSafe ? 'Explorer destination uses trusted ArcScan base URL.' : 'Explorer destination is unsafe.');

  const codeDigest = await sha256Digest(code);
  const calldataDigest = await sha256Digest(request.data);
  const stateBindingDigest = await sha256Digest({ chainId, registryAddress: network.registryAddress, account, codeDigest, registryRecordDigest, duplicate });
  const blockingReasons = checks.filter((item) => !item.passed && item.severity === 'blocking').map((item) => item.id);
  return deepFreeze({
    status: blockingReasons.length ? 'preflight-failed' : 'passed', passed: blockingReasons.length === 0,
    checks, blockingReasons, warnings: checks.filter((item) => !item.passed && item.severity === 'warning').map((item) => item.id),
    chainId, expectedChainId: network.chainId, networkName: network.chainName, registryAddress: network.registryAddress,
    registryContractVersion: network.registryContractVersion, blockNumber, codeDigest, registryRecordDigest,
    duplicate, simulationPassed, gasEstimateStatus, gasEstimate, transactionValue: request.value,
    calldataDigest, explorerExpectation: `${network.explorerBaseUrl}/tx/<validated-transaction-hash>`, stateBindingDigest,
  });
}
