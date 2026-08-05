import { cloneValue, deepFreeze, sha256Digest } from './canonical.js';
import { webV4Error } from './errors.js';
import { prepareWebRegistryPublish, safeTransactionRequest, verifyWebProofEnvelope } from './proof-adapter.js';
import { preflightArcTestnetProvider } from './proof-network-preflight.js';
import { normalizeWebRegistryReceipt, safeWebExplorerLink } from './proof-receipt.js';

export const WEB_PROOF_USER_APPROVED_SEND_ENABLED = true;
const TX_HASH = /^0x[0-9a-f]{64}$/u;

function fail(code, message) { throw webV4Error(code, message); }

function trustedClick(event) {
  return event?.type === 'click' && event?.isTrusted === true;
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
