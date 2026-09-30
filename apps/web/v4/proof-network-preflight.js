import { functionSelector } from '../../../packages/analyzer/src/keccak.js';
import { PUBLISH_REPORT_SELECTOR } from '../../../packages/proof/src/registry.js';
import { assertProofNetworkCapability, checksumAddress, DEFAULT_PROOF_NETWORK, normalizeChainId, resolveProofNetwork } from '../../../packages/proof/v4/network.js';
import { cloneValue, deepFreeze, sha256Digest } from './canonical.js';
import { safeTransactionRequest, verifyWebProofEnvelope } from './proof-adapter.js';
import { webV4Error } from './errors.js';

export const WEB_PROOF_READ_ONLY_METHODS = Object.freeze([
  'eth_chainId', 'eth_getCode', 'eth_call', 'eth_estimateGas', 'eth_gasPrice', 'eth_blockNumber',
]);
export const REGISTRY_HAS_REPORT_SELECTOR = functionSelector('hasReport(bytes32,address)');
export const REGISTRY_GET_LATEST_REPORT_SELECTOR = functionSelector('getLatestReport(bytes32,address)');
export const REGISTRY_VERSION_SELECTOR = functionSelector('REGISTRY_VERSION()');
export const REGISTRY_PUBLISHER_SCOPED_SELECTOR = functionSelector('PUBLISHER_SCOPED()');

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

function hexBytes(value) {
  const body = value.slice(2);
  return Uint8Array.from(body.match(/../gu) ?? [], (byte) => Number.parseInt(byte, 16));
}

function decodeTupleString(body, offset, field) {
  if (!Number.isSafeInteger(offset) || offset < 224 || offset % 32 !== 0) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', `${field} returned invalid ABI data.`);
  const start = offset * 2;
  if (start + 64 > body.length) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', `${field} returned invalid ABI data.`);
  const length = Number(BigInt(`0x${body.slice(start, start + 64)}`));
  if (!Number.isSafeInteger(length) || length < 0 || length > 512) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', `${field} returned invalid ABI data.`);
  const valueStart = start + 64;
  const valueEnd = valueStart + length * 2;
  const paddedEnd = valueStart + Math.ceil(length / 32) * 64;
  if (valueEnd > body.length || paddedEnd > body.length || !/^0*$/u.test(body.slice(valueEnd, paddedEnd))) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', `${field} returned invalid ABI data.`);
  try {
    return { value: new TextDecoder('utf-8', { fatal: true }).decode(hexBytes(`0x${body.slice(valueStart, valueEnd)}`)), paddedEnd };
  } catch {
    fail('WEB_V4_PROOF_PREFLIGHT_FAILED', `${field} returned invalid UTF-8.`);
  }
}

export function decodeRegistryReportRecord(value) {
  const normalized = safeHex(value, 'Registry state', { maxBytes: 8_192 });
  const encoded = normalized.slice(2);
  if (encoded.length < 64 + (7 * 64) || Number(BigInt(`0x${encoded.slice(0, 64)}`)) !== 32) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', 'Registry state returned invalid ABI data.');
  const body = encoded.slice(64);
  const words = body.slice(0, 7 * 64).match(/.{64}/gu);
  if (!words || words.length !== 7) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', 'Registry state returned invalid ABI data.');
  const score = Number(BigInt(`0x${words[2]}`));
  const scannerOffset = Number(BigInt(`0x${words[3]}`));
  const uriOffset = Number(BigInt(`0x${words[4]}`));
  const publishedAtValue = BigInt(`0x${words[6]}`);
  if (!Number.isSafeInteger(score) || score < 0 || score > 100 || scannerOffset !== 224 || publishedAtValue > BigInt(Number.MAX_SAFE_INTEGER)) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', 'Registry state returned invalid scalar data.');
  if (!/^0{24}[0-9a-f]{40}$/u.test(words[5])) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', 'Registry state returned an invalid publisher.');
  let publisher;
  try { publisher = checksumAddress(`0x${words[5].slice(24)}`, 'publisher'); }
  catch { fail('WEB_V4_PROOF_PREFLIGHT_FAILED', 'Registry state returned an invalid publisher.'); }
  const scannerVersion = decodeTupleString(body, scannerOffset, 'Registry scannerVersion');
  if (uriOffset !== scannerVersion.paddedEnd / 2) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', 'Registry state returned non-canonical string offsets.');
  const reportURI = decodeTupleString(body, uriOffset, 'Registry reportURI');
  if (reportURI.paddedEnd !== body.length) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', 'Registry state returned trailing ABI data.');
  return deepFreeze({
    sourceHash: `0x${words[0]}`,
    reportHash: `0x${words[1]}`,
    score,
    scannerVersion: scannerVersion.value,
    reportURI: reportURI.value,
    publisher,
    publishedAt: Number(publishedAtValue),
  });
}

function decodeAbiString(value, field) {
  const normalized = safeHex(value, field, { maxBytes: 1_024 });
  const body = normalized.slice(2);
  if (body.length < 128) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', `${field} returned invalid ABI data.`);
  const offset = Number(BigInt(`0x${body.slice(0, 64)}`));
  if (offset !== 32) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', `${field} returned invalid ABI data.`);
  const length = Number(BigInt(`0x${body.slice(64, 128)}`));
  if (!Number.isSafeInteger(length) || length < 0 || length > 512) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', `${field} returned invalid ABI data.`);
  const encoded = body.slice(128, 128 + length * 2);
  if (encoded.length !== length * 2) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', `${field} returned invalid ABI data.`);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(hexBytes(`0x${encoded}`)); }
  catch { fail('WEB_V4_PROOF_PREFLIGHT_FAILED', `${field} returned invalid UTF-8.`); }
}

export async function preflightProofRegistryReads({ provider, networkKey = DEFAULT_PROOF_NETWORK, timeoutMs = 5_000 } = {}) {
  const network = assertProofNetworkCapability(networkKey, 'read');
  const checks = [];
  const check = (id, passed, message) => { checks.push(deepFreeze({ id, passed, message, severity: 'blocking' })); return passed; };
  const chainId = normalizeChainId(await boundedReadOnlyRequest(provider, { method: 'eth_chainId' }, { timeoutMs }));
  const chainMatches = check('chain-matches', chainId === network.chainId, chainId === network.chainId ? `Provider is on trusted ${network.chainName}.` : 'Provider is on the wrong chain.');
  if (!chainMatches) return deepFreeze({ status: 'wrong-network', passed: false, checks, chainId, expectedChainId: network.chainId, registryAddress: network.registryAddress });

  const code = safeHex(await boundedReadOnlyRequest(provider, { method: 'eth_getCode', params: [network.registryAddress, 'latest'] }, { timeoutMs }), 'Registry bytecode');
  const runtimeBytecodeDigest = await sha256Digest(hexBytes(code));
  const runtimeMatches = check('runtime-bytecode-digest', runtimeBytecodeDigest === network.registryRuntimeBytecodeDigest, runtimeBytecodeDigest === network.registryRuntimeBytecodeDigest ? 'Registry runtime bytecode matches verified deployment evidence.' : 'Registry runtime bytecode digest does not match deployment evidence.');

  const versionResult = await boundedReadOnlyRequest(provider, { method: 'eth_call', params: [{ to: network.registryAddress, data: REGISTRY_VERSION_SELECTOR }, 'latest'] }, { timeoutMs });
  const registryVersion = decodeAbiString(versionResult, 'REGISTRY_VERSION');
  const versionMatches = check('registry-version', registryVersion === network.registryContractVersion, registryVersion === network.registryContractVersion ? `Registry version is ${registryVersion}.` : 'Registry version does not match the trusted contract version.');

  const publisherScopedResult = safeHex(await boundedReadOnlyRequest(provider, { method: 'eth_call', params: [{ to: network.registryAddress, data: REGISTRY_PUBLISHER_SCOPED_SELECTOR }, 'latest'] }, { timeoutMs }), 'PUBLISHER_SCOPED', { wordOnly: true });
  const publisherScoped = BigInt(publisherScopedResult) === 1n;
  check('publisher-scoped', publisherScoped, publisherScoped ? 'Registry records are publisher scoped.' : 'Registry publisher scope is not enabled.');

  let explorerContractUrl = null;
  try {
    const explorer = new URL(network.explorerBaseUrl);
    if (explorer.protocol === 'https:' && !explorer.username && !explorer.password) explorerContractUrl = `${explorer.toString().replace(/\/$/u, '')}/address/${network.registryAddress}`;
  } catch { /* represented by the explorer check */ }
  check('explorer-safe', explorerContractUrl !== null, explorerContractUrl ? 'Explorer contract link uses the trusted network profile.' : 'Explorer contract link is unavailable or unsafe.');

  const blockingReasons = checks.filter((item) => !item.passed).map((item) => item.id);
  return deepFreeze({
    status: blockingReasons.length ? 'preflight-failed' : 'passed',
    passed: blockingReasons.length === 0,
    checks,
    blockingReasons,
    chainId,
    expectedChainId: network.chainId,
    networkName: network.chainName,
    registryAddress: network.registryAddress,
    runtimeBytecodeDigest,
    expectedRuntimeBytecodeDigest: network.registryRuntimeBytecodeDigest,
    registryVersion,
    publisherScoped,
    explorerContractUrl,
    readOnlyMethods: Object.freeze(['eth_chainId', 'eth_getCode', 'eth_call']),
  });
}

export function invalidateNetworkPreflight(previous, reason = 'provider-state-changed') {
  return deepFreeze({ status: 'invalidated', passed: false, reason, previousStateBindingDigest: previous?.stateBindingDigest ?? null });
}

export async function preflightProofNetworkProvider({ provider, envelope, transactionRequest, payload, timeoutMs = 5_000 } = {}) {
  const network = resolveProofNetwork(envelope?.networkKey ?? DEFAULT_PROOF_NETWORK);
  try { assertProofNetworkCapability(network.networkKey, 'publish'); }
  catch {
    return deepFreeze({
      status: 'network-disabled', passed: false, checks: [deepFreeze({ id: 'network-publish-enabled', passed: false, message: `${network.chainName} proof publishing is disabled or unresolved.`, severity: 'blocking' })],
      blockingReasons: ['network-publish-enabled'], warnings: [], chainId: null, expectedChainId: network.chainId,
      networkName: network.chainName, registryAddress: network.registryAddress, stateBindingDigest: null,
    });
  }
  await verifyWebProofEnvelope(envelope);
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
  check('chain-matches', chainMatches, chainMatches ? `Provider is on trusted ${network.chainName}.` : 'Provider is on the wrong chain.');
  if (!chainMatches) return deepFreeze({ status: 'wrong-network', passed: false, checks, blockingReasons: ['chain-matches'], warnings: [], chainId, expectedChainId: network.chainId, stateBindingDigest: null });

  const code = safeHex(await boundedReadOnlyRequest(provider, { method: 'eth_getCode', params: [network.registryAddress, 'latest'] }, { timeoutMs }), 'Registry bytecode');
  const codePresent = code !== '0x' && !/^0x0+$/u.test(code);
  check('registry-code-present', codePresent, codePresent ? 'Trusted Registry V2 runtime bytecode is present.' : 'Trusted registry has no runtime bytecode.');
  const codeDigest = await sha256Digest(hexBytes(code));
  const runtimeDigestMatches = !network.registryRuntimeBytecodeDigest || codeDigest === network.registryRuntimeBytecodeDigest;
  check('runtime-bytecode-digest', runtimeDigestMatches, runtimeDigestMatches ? 'Registry runtime matches the trusted deployment profile.' : 'Registry runtime does not match verified deployment evidence.');
  const selectorCompatible = codePresent && code.includes(PUBLISH_REPORT_SELECTOR.slice(2).toLowerCase());
  check('registry-selector-compatible', selectorCompatible, selectorCompatible ? 'Registry runtime exposes the expected publish selector.' : 'Registry publish selector was not found in runtime bytecode.');
  if (!codePresent || !runtimeDigestMatches || !selectorCompatible) {
    const reason = !codePresent ? 'registry-code-present' : !runtimeDigestMatches ? 'runtime-bytecode-digest' : 'registry-selector-compatible';
    return deepFreeze({ status: 'preflight-failed', passed: false, checks, blockingReasons: [reason], warnings: [], chainId, expectedChainId: network.chainId, registryAddress: network.registryAddress, stateBindingDigest: null });
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
  let latestRecord = null;
  let latestRecordValid = !duplicate;
  if (duplicate) {
    try {
      latestRecord = decodeRegistryReportRecord(latestRecordRaw);
      latestRecordValid = latestRecord.publishedAt > 0 && latestRecord.publisher.toLowerCase() === account.toLowerCase();
    } catch { latestRecordValid = false; }
  }
  check('latest-record-decodes', latestRecordValid, latestRecordValid ? (duplicate ? 'The live latest Registry record decoded canonically.' : 'No live Registry record requires decoding.') : 'The live latest Registry record is malformed or conflicts with the publisher.');
  const registryRecordDigest = await sha256Digest(latestRecordRaw);

  let simulationPassed = false;
  try {
    safeHex(await boundedReadOnlyRequest(provider, { method: 'eth_call', params: [request, 'latest'] }, { timeoutMs }), 'Publish simulation', { maxBytes: 8_192 });
    simulationPassed = true;
  } catch { /* represented as a blocking check */ }
  check('publish-simulation', simulationPassed, simulationPassed ? 'Read-only publish simulation succeeded.' : 'Read-only publish simulation failed.');

  let gasEstimate = null;
  let gasEstimateStatus = 'unavailable';
  let gasPrice = null;
  let estimatedFeeBaseUnits = null;
  let estimatedFee = null;
  try {
    const estimate = safeHex(await boundedReadOnlyRequest(provider, { method: 'eth_estimateGas', params: [request] }, { timeoutMs }), 'Gas estimate', { maxBytes: 32 });
    const value = BigInt(estimate);
    if (value > 0n) { gasEstimate = `0x${value.toString(16)}`; gasEstimateStatus = 'estimated'; }
  } catch { /* an unavailable estimate is honest and non-blocking */ }
  check('gas-estimate', gasEstimateStatus === 'estimated', gasEstimateStatus === 'estimated' ? 'Read-only gas estimate is available.' : 'Gas estimate is unavailable; no value was invented.', 'warning');
  if (gasEstimateStatus === 'estimated') {
    try {
      const price = BigInt(safeHex(await boundedReadOnlyRequest(provider, { method: 'eth_gasPrice' }, { timeoutMs }), 'Gas price', { maxBytes: 32 }));
      if (price > 0n) {
        gasPrice = price.toString();
        estimatedFeeBaseUnits = (BigInt(gasEstimate) * price).toString();
        const decimals = network.nativeCurrency?.decimals ?? 18;
        const padded = estimatedFeeBaseUnits.padStart(decimals + 1, '0');
        const whole = padded.slice(0, -decimals);
        const fraction = padded.slice(-decimals).replace(/0+$/u, '');
        estimatedFee = `${whole}${fraction ? `.${fraction}` : ''} ${network.nativeCurrency?.symbol ?? 'native'}`;
      }
    } catch { /* an unavailable gas price is honest and non-blocking */ }
  }
  check('estimated-fee', estimatedFee !== null, estimatedFee ? 'Estimated fee is available from the live gas estimate and gas price.' : 'Estimated fee is unavailable; no value was invented.', 'warning');
  const valueValid = request.value === '0x0';
  check('transaction-value', valueValid, valueValid ? 'Registry transaction value is exactly zero.' : 'Registry transaction value is invalid.');
  let explorerSafe = false;
  try { const explorer = new URL(network.explorerBaseUrl); explorerSafe = explorer.protocol === 'https:' && !explorer.username && !explorer.password; } catch { /* fail closed */ }
  check('explorer-safe', explorerSafe, explorerSafe ? 'Explorer destination uses trusted ArcScan base URL.' : 'Explorer destination is unsafe.');

  const calldataDigest = await sha256Digest(request.data);
  const stateBindingDigest = await sha256Digest({ chainId, registryAddress: network.registryAddress, account, codeDigest, registryRecordDigest, duplicate });
  const blockingReasons = checks.filter((item) => !item.passed && item.severity === 'blocking').map((item) => item.id);
  return deepFreeze({
    status: blockingReasons.length ? 'preflight-failed' : 'passed', passed: blockingReasons.length === 0,
    checks, blockingReasons, warnings: checks.filter((item) => !item.passed && item.severity === 'warning').map((item) => item.id),
    chainId, expectedChainId: network.chainId, networkName: network.chainName, registryAddress: network.registryAddress,
    registryContractVersion: network.registryContractVersion, blockNumber, codeDigest, registryRecordDigest, latestRecord,
    duplicate, simulationPassed, gasEstimateStatus, gasEstimate, gasPrice, estimatedFeeBaseUnits, estimatedFee, transactionValue: request.value,
    calldataDigest, explorerExpectation: `${network.explorerBaseUrl}/tx/<validated-transaction-hash>`, stateBindingDigest,
  });
}

export function preflightArcTestnetProvider(options = {}) {
  return preflightProofNetworkProvider(options);
}
