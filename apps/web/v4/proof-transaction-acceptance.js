import { cloneValue, deepFreeze, sha256Digest } from './canonical.js';
import { webV4Error } from './errors.js';
import { createWebRegistryPayload, matchingRecord, prepareWebRegistryPublish, safeTransactionRequest, verifyWebProofEnvelope } from './proof-adapter.js';
import { preflightProofNetworkProvider } from './proof-network-preflight.js';
import { assertTrustedProofSend, WEB_PROOF_SEND_ENABLED } from './proof-send-boundary.js';
import { createBrowserProofSendCoordinator, PROOF_SEND_STATES } from './proof-send-coordinator.js';
import { decodeWebReportPublishedLog, normalizeWebRegistryReceipt, safeWebExplorerLink, WEB_REPORT_PUBLISHED_TOPIC } from './proof-receipt.js';
import { decodeCanonicalPublishReportCalldata, encodePublishReport, PUBLISH_REPORT_SELECTOR } from '../../../packages/proof/src/registry.js';
import { assertProofNetworkCapability, checksumAddress, normalizeChainId, resolveProofNetwork } from '../../../packages/proof/v4/network.js';
import { keccakHex } from '../../../packages/analyzer/src/keccak.js';

export const WEB_PROOF_USER_APPROVED_SEND_ENABLED = WEB_PROOF_SEND_ENABLED;
const TX_HASH = /^0x[0-9a-f]{64}$/u;
const EXISTING_TRANSACTION_READ_METHODS = new Set(['eth_chainId', 'eth_getTransactionByHash', 'eth_getTransactionReceipt']);

function fail(code, message) { throw webV4Error(code, message); }

function trustedClick(event) {
  return event?.type === 'click' && event?.isTrusted === true;
}

export function isValidProofTransactionHash(value) {
  return TX_HASH.test(String(value ?? '').toLowerCase());
}

export function proofPublicationIntentId(request, networkKey) {
  const material = [
    'veilforge.proof.publication.intent.v1',
    String(networkKey ?? ''),
    String(request?.chainId ?? '').toLowerCase(),
    String(request?.from ?? '').toLowerCase(),
    String(request?.to ?? '').toLowerCase(),
    String(request?.value ?? '').toLowerCase(),
    String(request?.data ?? '').toLowerCase(),
  ].join('\n');
  return keccakHex(material);
}

function attemptSnapshot(attempt) {
  return deepFreeze({ intentId: attempt.intentId, state: attempt.state, status: attempt.status, transactionHash: attempt.transactionHash ?? null });
}

async function notifyAttempt(attempt, onAttemptState) {
  if (typeof onAttemptState === 'function') await onAttemptState(attemptSnapshot(attempt));
}

async function acquireSendAttempt(provider, intentId, coordinator) {
  if (!provider?.request) fail('WEB_V4_PROVIDER_UNAVAILABLE', 'No EIP-1193 provider is available.');
  const claim = await coordinator.claim(intentId);
  if (!claim.acquired) {
    const code = [PROOF_SEND_STATES.PREPARED, PROOF_SEND_STATES.WALLET_REQUEST_PENDING].includes(claim.record.state) ? 'WEB_V4_SEND_IN_FLIGHT' : 'WEB_V4_RECONCILIATION_REQUIRED';
    fail(code, code === 'WEB_V4_SEND_IN_FLIGHT' ? 'An identical proof publication is already in flight.' : 'This proof publication already has an indeterminate or submitted wallet attempt; reconcile it before any retry.');
  }
  return { intentId, state: PROOF_SEND_STATES.PREPARED, status: 'validating', transactionHash: null, providerInvoked: false, coordinator };
}

async function releaseSendAttempt(attempt, walletRejected = false) {
  await attempt.coordinator.releaseBeforeRetry(attempt.intentId, { walletRejected, providerInvoked: attempt.providerInvoked });
  attempt.state = PROOF_SEND_STATES.REJECTED;
  attempt.status = 'released';
  attempt.transactionHash = null;
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

async function existingTransactionRequest(provider, request, timeoutMs, networkName = 'Arc network') {
  if (!EXISTING_TRANSACTION_READ_METHODS.has(request?.method)) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', 'Only existing-transaction read methods are allowed.');
  try { return await boundedProviderRequest(provider, request, timeoutMs); }
  catch (error) {
    if (error?.code?.startsWith?.('WEB_V4_')) throw error;
    fail('WEB_V4_PROVIDER_UNAVAILABLE', `The ${networkName} provider request failed.`);
  }
}

export async function inspectExistingProofTransaction({ provider, transactionHash, envelope, verification, walletState, timeoutMs = 5_000 } = {}) {
  const hash = String(transactionHash ?? '').toLowerCase();
  if (!isValidProofTransactionHash(hash)) fail('WEB_V4_TX_INVALID', 'Enter a valid 0x-prefixed 32-byte transaction hash.');
  await verifyWebProofEnvelope(envelope, verification ? { verification } : {});
  const network = resolveProofNetwork(envelope.networkKey);
  try { assertProofNetworkCapability(network.networkKey, 'read'); }
  catch { fail('WEB_V4_SEND_DISABLED', `${network.chainName} proof reads are disabled or unresolved.`); }
  const chainId = normalizeChainId(await existingTransactionRequest(provider, { method: 'eth_chainId' }, timeoutMs, network.chainName));
  if (chainId !== network.chainId || walletState?.chainId !== network.chainId) fail('WEB_V4_WRONG_NETWORK', `The provider is not on ${network.chainName}.`);
  const [transaction, receipt] = await Promise.all([
    existingTransactionRequest(provider, { method: 'eth_getTransactionByHash', params: [hash] }, timeoutMs, network.chainName),
    existingTransactionRequest(provider, { method: 'eth_getTransactionReceipt', params: [hash] }, timeoutMs, network.chainName),
  ]);
  if (!transaction) fail('WEB_V4_TX_NOT_FOUND', `Transaction not found on ${network.chainName}.`);
  if (!receipt) fail('WEB_V4_RECEIPT_PENDING', 'Transaction is not confirmed yet.');
  if (String(transaction.hash ?? '').toLowerCase() !== hash || String(receipt.transactionHash ?? '').toLowerCase() !== hash) fail('WEB_V4_TX_INVALID', 'Transaction identity does not match the requested hash.');
  if (!(receipt.status === true || receipt.status === 1 || receipt.status === '1' || receipt.status === '0x1')) fail('WEB_V4_RECEIPT_REVERTED', 'Transaction reverted.');
  if (String(transaction.to ?? '').toLowerCase() !== network.registryAddress.toLowerCase() || String(receipt.to ?? transaction.to ?? '').toLowerCase() !== network.registryAddress.toLowerCase()) fail('WEB_V4_REGISTRY_MISMATCH', `Transaction does not target the trusted ${network.chainName} registry.`);
  const transactionInput = String(transaction.input ?? '').toLowerCase();
  if (!transactionInput.startsWith(PUBLISH_REPORT_SELECTOR.toLowerCase()) || transactionInput.length < 2 + 8 + (64 * 3)) fail('WEB_V4_REGISTRY_ABI_MISMATCH', 'Transaction does not call the expected registry publish method.');
  let calldataPayload;
  try { calldataPayload = decodeCanonicalPublishReportCalldata(transactionInput); }
  catch { fail('WEB_V4_REGISTRY_ABI_MISMATCH', 'Transaction calldata is not a canonical Registry V2 publication.'); }
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
  const calldataReportHash = calldataPayload.reportHash;
  if (event.reportHash !== calldataReportHash) fail('WEB_V4_EVENT_MISMATCH', 'Registry event report hash does not match transaction calldata.');
  const transactionReportHash = `sha256:${event.reportHash.slice(2)}`;
  const identity = deepFreeze({ transactionHash: hash, blockNumber, publisher, networkKey: network.networkKey, registryAddress: network.registryAddress, transactionReportHash, currentReportHash: envelope.reportHash, explorerUrl: safeWebExplorerLink(hash, network.networkKey) });
  if (transactionReportHash !== envelope.reportHash) return deepFreeze({ status: 'report-hash-mismatch', match: false, identity });
  const normalizedReceipt = await normalizeWebRegistryReceipt(receipt, envelope, { verification, publisher, providerChainId: chainId, transactionHash: hash, payload: calldataPayload });
  return deepFreeze({ status: 'verified', match: true, identity, receipt: normalizedReceipt });
}

async function submitUserApprovedProofTransactionInternal({
  provider, event, envelope, verification, preflight, networkPreflight, review, currentStateBindingDigest,
  timeoutMs = 30_000, revalidationTimeoutMs = 5_000, attempt, onAttemptState,
} = {}) {
  if (!trustedClick(event)) fail('WEB_V4_USER_GESTURE_REQUIRED', 'Publishing requires a trusted click on the Publish Proof button.');
  const selectedNetwork = resolveProofNetwork(envelope?.networkKey);
  try { assertProofNetworkCapability(selectedNetwork.networkKey, 'publish'); }
  catch { fail('WEB_V4_SEND_DISABLED', `${selectedNetwork.chainName} proof publishing is disabled or unresolved.`); }
  await verifyWebProofEnvelope(envelope, verification ? { verification } : {});
  if (review?.reviewReady !== true || preflight?.status !== 'ready-to-publish' || networkPreflight?.passed !== true) fail('WEB_V4_SEND_DISABLED', 'The transaction review is not ready.');
  if (networkPreflight.duplicate === true) fail('WEB_V4_PROOF_DUPLICATE', 'This publisher-scoped proof already exists.');
  if (!networkPreflight.stateBindingDigest || currentStateBindingDigest !== networkPreflight.stateBindingDigest) fail('WEB_V4_SEND_DISABLED', 'The wallet or registry preflight state changed.');

  const request = safeTransactionRequest(preflight.transactionRequest, envelope.networkKey);
  const expectedPayload = await createWebRegistryPayload(envelope, preflight.payload?.reportURI ?? '');
  if (await sha256Digest(expectedPayload) !== await sha256Digest(preflight.payload)
    || request.data !== encodePublishReport(expectedPayload)) fail('WEB_V4_TX_INVALID', 'The transaction request is not bound to the current verified report.');
  const transactionDigest = await sha256Digest(request);
  if (review.transactionDigest !== transactionDigest) fail('WEB_V4_TX_INVALID', 'The reviewed transaction request changed.');

  const network = resolveProofNetwork(envelope.networkKey);
  let accounts;
  let providerChainId;
  try {
    [accounts, providerChainId] = await Promise.all([
      boundedProviderRequest(provider, { method: 'eth_accounts' }, revalidationTimeoutMs),
      boundedProviderRequest(provider, { method: 'eth_chainId' }, revalidationTimeoutMs).then(normalizeChainId),
    ]);
  } catch (error) {
    if (error?.code?.startsWith?.('WEB_V4_')) throw error;
    fail('WEB_V4_PROVIDER_UNAVAILABLE', 'The wallet state could not be revalidated safely.');
  }
  if (!Array.isArray(accounts) || accounts.length === 0) fail('WEB_V4_ACCOUNT_UNAVAILABLE', 'The active wallet account is unavailable.');
  let activeAccount;
  let requestedAccount;
  try {
    activeAccount = checksumAddress(accounts[0], 'account');
    requestedAccount = checksumAddress(request.from, 'account');
  } catch {
    fail('WEB_V4_ACCOUNT_UNAVAILABLE', 'The active wallet account is invalid.');
  }
  if (activeAccount.toLowerCase() !== requestedAccount.toLowerCase()) fail('WEB_V4_SEND_DISABLED', 'The active wallet account changed after preflight.');
  if (providerChainId !== network.chainId) fail('WEB_V4_WRONG_NETWORK', 'The wallet network changed after preflight.');

  const freshNetworkPreflight = await preflightProofNetworkProvider({
    provider,
    envelope,
    transactionRequest: request,
    payload: expectedPayload,
    timeoutMs: revalidationTimeoutMs,
  });
  if (freshNetworkPreflight.duplicate === true) fail('WEB_V4_PROOF_DUPLICATE', 'This publisher-scoped proof was published after preflight.');
  if (freshNetworkPreflight.passed !== true) {
    if (freshNetworkPreflight.status === 'wrong-network') fail('WEB_V4_WRONG_NETWORK', 'The wallet network changed after preflight.');
    fail('WEB_V4_PROOF_PREFLIGHT_FAILED', 'The final registry preflight did not pass.');
  }
  if (freshNetworkPreflight.stateBindingDigest !== networkPreflight.stateBindingDigest) fail('WEB_V4_SEND_DISABLED', 'The wallet or registry state changed after review.');

  try {
    assertTrustedProofSend({
      networkKey: network.networkKey,
      providerChainId,
      registryAddress: request.to,
      transactionRequest: request,
      userApproved: true,
    });
  } catch {
    fail('WEB_V4_SEND_DISABLED', 'The lower-level trusted send decision rejected this transaction.');
  }

  attempt.state = PROOF_SEND_STATES.WALLET_REQUEST_PENDING;
  attempt.status = 'wallet-request-pending';
  await attempt.coordinator.transition(attempt.intentId, PROOF_SEND_STATES.WALLET_REQUEST_PENDING);
  await notifyAttempt(attempt, onAttemptState);
  let response;
  let timer;
  try {
    await attempt.coordinator.transition(attempt.intentId, PROOF_SEND_STATES.PROVIDER_CALL_STARTED);
    attempt.state = PROOF_SEND_STATES.PROVIDER_CALL_STARTED;
    attempt.status = 'reconciliation-required';
    attempt.providerInvoked = true;
    const sendPromise = Promise.resolve(provider.request(cloneValue({ method: 'eth_sendTransaction', params: [request] })));
    sendPromise.then(async (lateResponse) => {
      if (attempt.state !== PROOF_SEND_STATES.RECONCILIATION_REQUIRED) return;
      const lateHash = String(lateResponse ?? '').toLowerCase();
      if (!TX_HASH.test(lateHash)) return;
      attempt.transactionHash = lateHash;
      attempt.state = PROOF_SEND_STATES.TX_HASH_KNOWN;
      attempt.status = 'pending';
      try {
        await attempt.coordinator.transition(attempt.intentId, PROOF_SEND_STATES.TX_HASH_KNOWN, lateHash);
        await notifyAttempt(attempt, onAttemptState);
      } catch { /* persisted ambiguous state remains fail-closed */ }
    }, () => {});
    await notifyAttempt(attempt, onAttemptState);
    response = await Promise.race([
      sendPromise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(webV4Error('WEB_V4_TIMEOUT', 'The wallet request timed out.')), timeoutMs); }),
    ]);
  } catch (error) {
    if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') fail('WEB_V4_USER_REJECTED', 'The wallet transaction request was rejected.');
    if (error?.code?.startsWith?.('WEB_V4_')) throw error;
    fail('WEB_V4_TX_INVALID', 'The wallet transaction request failed.');
  } finally { clearTimeout(timer); }
  const transactionHash = String(response ?? '').toLowerCase();
  if (!TX_HASH.test(transactionHash)) fail('WEB_V4_TX_INVALID', 'The wallet returned an invalid transaction hash.');
  attempt.transactionHash = transactionHash;
  attempt.state = PROOF_SEND_STATES.TX_HASH_KNOWN;
  attempt.status = 'pending';
  await attempt.coordinator.transition(attempt.intentId, PROOF_SEND_STATES.TX_HASH_KNOWN, transactionHash);
  await notifyAttempt(attempt, onAttemptState);
  return deepFreeze({ status: 'pending', intentId: attempt.intentId, transactionHash, explorerUrl: safeWebExplorerLink(transactionHash, envelope.networkKey) });
}

export async function submitUserApprovedProofTransaction(options = {}) {
  const { provider, event, envelope, preflight, priorAttempt = null, onAttemptState, timeoutMs = 30_000 } = options;
  if (!trustedClick(event)) fail('WEB_V4_USER_GESTURE_REQUIRED', 'Publishing requires a trusted click on the Publish Proof button.');
  const network = resolveProofNetwork(envelope?.networkKey);
  try { assertProofNetworkCapability(network.networkKey, 'publish'); }
  catch { fail('WEB_V4_SEND_DISABLED', `${network.chainName} proof publishing is disabled or unresolved.`); }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 120_000) fail('WEB_V4_PROOF_PREFLIGHT_FAILED', 'The provider timeout is invalid.');
  const request = safeTransactionRequest(preflight?.transactionRequest, network.networkKey);
  const intentId = proofPublicationIntentId(request, network.networkKey);
  if (priorAttempt && priorAttempt.intentId === intentId && ['pending', 'reconciliation-required'].includes(priorAttempt.status)) {
    fail('WEB_V4_RECONCILIATION_REQUIRED', 'A persisted wallet attempt must be reconciled before this proof can be sent again.');
  }
  let coordinator;
  try { coordinator = options.sendCoordinator ?? createBrowserProofSendCoordinator(); }
  catch { fail('WEB_V4_RECONCILIATION_REQUIRED', 'Atomic cross-context publication coordination is unavailable.'); }
  const attempt = await acquireSendAttempt(provider, intentId, coordinator);
  try {
    return await submitUserApprovedProofTransactionInternal({ ...options, attempt, onAttemptState });
  } catch (error) {
    if (!attempt.providerInvoked || error?.code === 'WEB_V4_USER_REJECTED') {
      if (attempt.providerInvoked && error?.code === 'WEB_V4_USER_REJECTED') {
        attempt.state = PROOF_SEND_STATES.REJECTED;
        attempt.status = 'user-rejected';
        await attempt.coordinator.transition(attempt.intentId, PROOF_SEND_STATES.REJECTED);
        try { await notifyAttempt(attempt, onAttemptState); } catch { /* rejection remains safely retryable */ }
      }
      await releaseSendAttempt(attempt, error?.code === 'WEB_V4_USER_REJECTED');
      try { await notifyAttempt(attempt, onAttemptState); } catch { /* shared coordination state is already released */ }
      throw error;
    }
    attempt.state = PROOF_SEND_STATES.RECONCILIATION_REQUIRED;
    attempt.status = 'reconciliation-required';
    try {
      await attempt.coordinator.transition(attempt.intentId, PROOF_SEND_STATES.RECONCILIATION_REQUIRED);
      await notifyAttempt(attempt, onAttemptState);
    } catch { /* shared coordination state remains fail-closed */ }
    fail('WEB_V4_RECONCILIATION_REQUIRED', 'The wallet send outcome is indeterminate. Reconcile the wallet or transaction hash before any retry.');
  }
}

export async function waitForVerifiedProofReceipt({ provider, transactionHash, envelope, verification, publisher, providerChainId, payload = null, timeoutMs = 120_000, pollIntervalMs = 1_000, signal } = {}) {
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
    if (receipt) return normalizeWebRegistryReceipt(receipt, envelope, { verification, publisher, providerChainId, transactionHash: hash, payload });
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
  const historicalReceipt = await waitForVerifiedProofReceipt({ provider, transactionHash, envelope, verification, publisher: walletState?.account, providerChainId: walletState?.chainId, payload: prepared.payload, timeoutMs: receiptTimeoutMs, pollIntervalMs });
  const networkPreflight = await preflightProofNetworkProvider({ provider, envelope, transactionRequest: prepared.transactionRequest, payload: prepared.payload, timeoutMs: rpcTimeoutMs });
  if (networkPreflight.passed !== true || networkPreflight.duplicate !== true) fail('WEB_V4_PROOF_DUPLICATE', 'The verified publication is not visible in the publisher-scoped registry state.');
  if (!matchingRecord(networkPreflight.latestRecord, prepared.payload, walletState.account)
    || historicalReceipt.projectId !== prepared.payload.projectId
    || historicalReceipt.sourceHash !== prepared.payload.sourceHash
    || historicalReceipt.reportURI !== prepared.payload.reportURI) fail('WEB_V4_STALE_PUBLICATION', 'The historical transaction does not match the current Registry record.');
  const receipt = deepFreeze({ ...historicalReceipt, evidenceStatus: 'current-state-verified' });
  const preflight = await prepareWebRegistryPublish({ verification, envelope, walletState, disclosureAcknowledged, existingRecord: networkPreflight.latestRecord, existingTransactionIdentity: receipt });
  if (preflight.status !== 'already-published' || preflight.transactionRequest !== null) fail('WEB_V4_PROOF_DUPLICATE', 'Duplicate reconciliation did not close the send boundary.');
  return deepFreeze({ status: 'already-published', historicalReceipt, receipt, preflight, networkPreflight });
}
