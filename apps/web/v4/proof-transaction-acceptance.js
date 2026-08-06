import { cloneValue, deepFreeze, sha256Digest } from './canonical.js';
import { webV4Error } from './errors.js';
import { prepareWebRegistryPublish, safeTransactionRequest, verifyWebProofEnvelope } from './proof-adapter.js';
import { preflightArcTestnetProvider } from './proof-network-preflight.js';
import { decodeWebReportPublishedLog, normalizeWebRegistryReceipt, safeWebExplorerLink, WEB_REPORT_PUBLISHED_TOPIC } from './proof-receipt.js';
import { PUBLISH_REPORT_SELECTOR } from '../../../packages/proof/src/registry.js';
import { checksumAddress, normalizeChainId, resolveProofNetwork } from '../../../packages/proof/v4/network.js';

export const WEB_PROOF_USER_APPROVED_SEND_ENABLED = true;
const TX_HASH = /^0x[0-9a-f]{64}$/u;
const EXISTING_TRANSACTION_READ_METHODS = new Set(['eth_chainId', 'eth_getTransactionByHash', 'eth_getTransactionReceipt']);

function fail(code, message) { throw webV4Error(code, message); }

function trustedClick(event) {
  return event?.type === 'click' && event?.isTrusted === true;
}

export function isValidProofTransactionHash(value) {
  return TX_HASH.test(String(value ?? '').toLowerCase());
}

async function boundedProviderRequest(provider, request, timeoutMs) {
  if (!provider?.request) fail('WEB_V4_PROVIDER_UNAVAILABLE', 'No EIP-1193 provider is available.');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 120_000) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', 'The provider timeout is invalid.');
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => provider.request(cloneValue(request))),
      new Promise((_, reject) => { timer = setTimeout(() => reject(webV4Error('WEB_V4_TIMEOUT', 'The wallet request timed out.')), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

async function existingTransactionRequest(provider, request, timeoutMs) {
  if (!EXISTING_TRANSACTION_READ_METHODS.has(request?.method)) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', 'Only existing-transaction read methods are allowed.');
  try { return await boundedProviderRequest(provider, request, timeoutMs); }
  catch (error) {
    if (error?.code?.startsWith?.('WEB_V4_')) throw error;
    fail('WEB_V4_PROVIDER_UNAVAILABLE', 'The Arc Testnet provider request failed.');
  }
}

export async function inspectExistingProofTransaction({ provider, transactionHash, envelope, verification, walletState, timeoutMs = 5_000 } = {}) {
  const hash = String(transactionHash ?? '').toLowerCase();
  if (!isValidProofTransactionHash(hash)) fail('WEB_V4_TX_INVALID', 'Enter a valid 0x-prefixed 32-byte transaction hash.');
  await verifyWebProofEnvelope(envelope, verification ? { verification } : {});
  const network = resolveProofNetwork(envelope.networkKey);
  const chainId = normalizeChainId(await existingTransactionRequest(provider, { method: 'eth_chainId' }, timeoutMs));
  if (chainId !== network.chainId || walletState?.chainId !== network.chainId) fail('WEB_V4_WRONG_NETWORK', 'The provider is not on Arc Testnet.');
  const [transaction, receipt] = await Promise.all([
    existingTransactionRequest(provider, { method: 'eth_getTransactionByHash', params: [hash] }, timeoutMs),
    existingTransactionRequest(provider, { method: 'eth_getTransactionReceipt', params: [hash] }, timeoutMs),
  ]);
  if (!transaction) fail('WEB_V4_TX_NOT_FOUND', 'Transaction not found on Arc Testnet.');
  if (!receipt) fail('WEB_V4_RECEIPT_PENDING', 'Transaction is not confirmed yet.');
  if (String(transaction.hash ?? '').toLowerCase() !== hash || String(receipt.transactionHash ?? '').toLowerCase() !== hash) fail('WEB_V4_TX_INVALID', 'Transaction identity does not match the requested hash.');
  if (!(receipt.status === true || receipt.status === 1 || receipt.status === '1' || receipt.status === '0x1')) fail('WEB_V4_RECEIPT_REVERTED', 'Transaction reverted.');
  if (String(transaction.to ?? '').toLowerCase() !== network.registryAddress.toLowerCase() || String(receipt.to ?? transaction.to ?? '').toLowerCase() !== network.registryAddress.toLowerCase()) fail('WEB_V4_REGISTRY_MISMATCH', 'Transaction does not target the trusted Arc Testnet registry.');
  const transactionInput = String(transaction.input ?? '').toLowerCase();
  if (!transactionInput.startsWith(PUBLISH_REPORT_SELECTOR.toLowerCase()) || transactionInput.length < 2 + 8 + (64 * 3)) fail('WEB_V4_REGISTRY_ABI_MISMATCH', 'Transaction does not call the expected registry publish method.');
  let publisher;
  try { publisher = checksumAddress(transaction.from ?? receipt.from, 'publisher'); }
  catch { fail('WEB_V4_RECEIPT_INVALID', 'Transaction publisher is invalid.'); }
  if (walletState?.account?.toLowerCase() !== publisher.toLowerCase() || String(receipt.from ?? publisher).toLowerCase() !== publisher.toLowerCase()) fail('WEB_V4_EVENT_MISMATCH', 'Transaction publisher does not match the connected wallet.');
  const blockNumber = normalizeChainId(receipt.blockNumber);
  if (transaction.blockNumber != null && normalizeChainId(transaction.blockNumber) !== blockNumber) fail('WEB_V4_RECEIPT_INVALID', 'Transaction block number does not match the receipt.');
  if (transaction.blockHash && receipt.blockHash && String(transaction.blockHash).toLowerCase() !== String(receipt.blockHash).toLowerCase()) fail('WEB_V4_RECEIPT_INVALID', 'Transaction block identity does not match the receipt.');
  const log = (receipt.logs ?? []).find((candidate) => String(candidate?.address ?? '').toLowerCase() === network.registryAddress.toLowerCase()
    && String(candidate?.topics?.[0] ?? '').toLowerCase() === WEB_REPORT_PUBLISHED_TOPIC.toLowerCase());
  if (!log) fail('WEB_V4_EVENT_MISMATCH', 'The trusted registry publication event is missing.');
  let event;
  try { event = decodeWebReportPublishedLog(log); }
  catch { fail('WEB_V4_EVENT_MISMATCH', 'The trusted registry publication event is malformed.'); }
  if (event.publisher.toLowerCase() !== publisher.toLowerCase()) fail('WEB_V4_EVENT_MISMATCH', 'Registry event publisher does not match the transaction sender.');
  const calldataReportHash = `0x${transactionInput.slice(2 + 8 + (64 * 2), 2 + 8 + (64 * 3))}`;
  if (event.reportHash !== calldataReportHash) fail('WEB_V4_EVENT_MISMATCH', 'Registry event report hash does not match transaction calldata.');
  const transactionReportHash = `sha256:${event.reportHash.slice(2)}`;
  const identity = deepFreeze({ transactionHash: hash, blockNumber, publisher, registryAddress: network.registryAddress, transactionReportHash, currentReportHash: envelope.reportHash, explorerUrl: safeWebExplorerLink(hash, network.networkKey) });
  if (transactionReportHash !== envelope.reportHash) return deepFreeze({ status: 'report-hash-mismatch', match: false, identity });
  const normalizedReceipt = await normalizeWebRegistryReceipt(receipt, envelope, { verification, publisher, providerChainId: chainId, transactionHash: hash });
  return deepFreeze({ status: 'verified', match: true, identity, receipt: normalizedReceipt });
}

export async function submitUserApprovedProofTransaction({ provider, event, envelope, preflight, networkPreflight, review, currentStateBindingDigest, timeoutMs = 30_000 } = {}) {
  if (!trustedClick(event)) fail('WEB_V4_USER_GESTURE_REQUIRED', 'Publishing requires a trusted click on the Publish Proof button.');
  await verifyWebProofEnvelope(envelope);
  if (review?.reviewReady !== true || preflight?.status !== 'ready-to-publish' || networkPreflight?.passed !== true) fail('WEB_V4_SEND_DISABLED', 'The transaction review is not ready.');
  if (networkPreflight.duplicate === true) fail('WEB_V4_PROOF_DUPLICATE', 'This publisher-scoped proof already exists.');
  if (!networkPreflight.stateBindingDigest || currentStateBindingDigest !== networkPreflight.stateBindingDigest) fail('WEB_V4_SEND_DISABLED', 'The wallet or registry preflight state changed.');
  const request = safeTransactionRequest(preflight.transactionRequest, envelope.networkKey);
  const transactionDigest = await sha256Digest(request);
  if (review.transactionDigest !== transactionDigest) fail('WEB_V4_TX_INVALID', 'The reviewed transaction request changed.');
  let response;
  try {
    response = await boundedProviderRequest(provider, { method: 'eth_sendTransaction', params: [request] }, timeoutMs);
  } catch (error) {
    if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') fail('WEB_V4_USER_REJECTED', 'The wallet transaction request was rejected.');
    if (error?.code?.startsWith?.('WEB_V4_')) throw error;
    fail('WEB_V4_TX_INVALID', 'The wallet transaction request failed.');
  }
  const transactionHash = String(response ?? '').toLowerCase();
  if (!TX_HASH.test(transactionHash)) fail('WEB_V4_TX_INVALID', 'The wallet returned an invalid transaction hash.');
  return deepFreeze({ status: 'pending', transactionHash, explorerUrl: safeWebExplorerLink(transactionHash, envelope.networkKey) });
}

export async function waitForVerifiedProofReceipt({ provider, transactionHash, envelope, verification, publisher, providerChainId, timeoutMs = 120_000, pollIntervalMs = 1_000, signal } = {}) {
  const hash = String(transactionHash ?? '').toLowerCase();
  safeWebExplorerLink(hash, envelope?.networkKey);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 300_000) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', 'The receipt timeout is invalid.');
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 0 || pollIntervalMs > 10_000) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', 'The receipt polling interval is invalid.');
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) fail('WEB_V4_ABORTED', 'Receipt verification was cancelled.');
    let receipt;
    const requestBudgetMs = Math.max(50, Math.min(10_000, timeoutMs - (Date.now() - startedAt)));
    try { receipt = await boundedProviderRequest(provider, { method: 'eth_getTransactionReceipt', params: [hash] }, requestBudgetMs); }
    catch (error) {
      if (error?.code?.startsWith?.('WEB_V4_')) throw error;
      fail('WEB_V4_RECEIPT_INVALID', 'The transaction receipt could not be read.');
    }
    if (receipt) return normalizeWebRegistryReceipt(receipt, envelope, { verification, publisher, providerChainId, transactionHash: hash });
    const remaining = timeoutMs - (Date.now() - startedAt);
    if (remaining <= 0) break;
    await new Promise((resolve, reject) => {
      const onAbort = () => { clearTimeout(delay); reject(webV4Error('WEB_V4_ABORTED', 'Receipt verification was cancelled.')); };
      const delay = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, Math.min(pollIntervalMs, remaining));
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
  fail('WEB_V4_TIMEOUT', 'The transaction remained pending beyond the bounded receipt window.');
}

export async function reconcileVerifiedProofPublication({ provider, transactionHash, envelope, verification, walletState, disclosureAcknowledged = false, receiptTimeoutMs = 120_000, pollIntervalMs = 1_000, rpcTimeoutMs = 5_000 } = {}) {
  const prepared = await prepareWebRegistryPublish({ verification, envelope, walletState, disclosureAcknowledged });
  if (prepared.status !== 'ready-to-publish') fail('WEB_V4_PROOF_PREFLIGHT_FAILED', 'A safe transaction request could not be reconstructed for reconciliation.');
  const receipt = await waitForVerifiedProofReceipt({ provider, transactionHash, envelope, verification, publisher: walletState?.account, providerChainId: walletState?.chainId, timeoutMs: receiptTimeoutMs, pollIntervalMs });
  const networkPreflight = await preflightArcTestnetProvider({ provider, envelope, transactionRequest: prepared.transactionRequest, payload: prepared.payload, timeoutMs: rpcTimeoutMs });
  if (networkPreflight.passed !== true || networkPreflight.duplicate !== true) fail('WEB_V4_PROOF_DUPLICATE', 'The verified publication is not visible in the publisher-scoped registry state.');
  const preflight = await prepareWebRegistryPublish({ verification, envelope, walletState, disclosureAcknowledged, existingRecord: { ...prepared.payload, publisher: walletState.account }, existingTransactionIdentity: receipt });
  if (preflight.status !== 'already-published' || preflight.transactionRequest !== null) fail('WEB_V4_PROOF_DUPLICATE', 'Duplicate reconciliation did not close the send boundary.');
  return deepFreeze({ status: 'already-published', receipt, preflight, networkPreflight });
}
