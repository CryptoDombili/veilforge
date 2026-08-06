import test from 'node:test';
import assert from 'node:assert/strict';
import { createUserGatedProofReview, WEB_PROOF_SEND_ENABLED } from '../../../apps/web/v4/proof-send-boundary.js';
import { inspectExistingProofTransaction, isValidProofTransactionHash, reconcileVerifiedProofPublication, submitUserApprovedProofTransaction, waitForVerifiedProofReceipt, WEB_PROOF_USER_APPROVED_SEND_ENABLED } from '../../../apps/web/v4/proof-transaction-acceptance.js';
import { PUBLISH_REPORT_SELECTOR } from '../../../packages/proof/src/registry.js';
import { REGISTRY_GET_LATEST_REPORT_SELECTOR, REGISTRY_HAS_REPORT_SELECTOR } from '../../../apps/web/v4/proof-network-preflight.js';
import { renderTransactionSummary } from '../../../apps/web/v4/proof-ui.js';
import { ACCOUNT, TX_HASH, publicationLog, readyProof, receipt } from './helpers.mjs';

const click = Object.freeze({ type: 'click', isTrusted: true });
const network = (overrides = {}) => ({ passed: true, status: 'passed', stateBindingDigest: 'sha256:state', duplicate: false, ...overrides });

async function context(overrides = {}) {
  const proof = await readyProof();
  const networkPreflight = network(overrides.networkPreflight);
  const review = await createUserGatedProofReview({ envelope: proof.envelope, preflight: proof.preflight, networkPreflight, disclosureAcknowledged: true, userGesture: true, reviewAcknowledged: true, currentStateBindingDigest: networkPreflight.stateBindingDigest });
  return { ...proof, ...overrides, networkPreflight, review: overrides.review ?? review, currentStateBindingDigest: overrides.currentStateBindingDigest ?? networkPreflight.stateBindingDigest };
}

function provider(handler) {
  const calls = [];
  return { calls, async request(request) { calls.push(structuredClone(request)); return handler(request, calls.length); } };
}

const word = (value) => `0x${BigInt(value).toString(16).padStart(64, '0')}`;
const publishInput = (reportHash) => `${PUBLISH_REPORT_SELECTOR}${'0'.repeat(128)}${String(reportHash).replace(/^0x/u, '')}`;
function reconciliationProvider(input, { duplicate = true, receiptHash = TX_HASH } = {}) {
  return provider(({ method, params = [] }) => {
    if (method === 'eth_getTransactionReceipt') return receipt(input.envelope, input.preflight, { transactionHash: receiptHash });
    if (method === 'eth_getTransactionByHash') return { hash: TX_HASH, from: ACCOUNT, to: input.envelope.registryAddress, input: publishInput(input.preflight.payload.reportHash), blockNumber: '0x10' };
    if (method === 'eth_chainId') return '0x4cef52';
    if (method === 'eth_getCode') return `0x6000${PUBLISH_REPORT_SELECTOR.slice(2)}6000`;
    if (method === 'eth_blockNumber') return '0x100';
    if (method === 'eth_estimateGas') return '0x1d4c0';
    if (method === 'eth_call') {
      const data = String(params[0]?.data ?? '').toLowerCase();
      if (data.startsWith(REGISTRY_HAS_REPORT_SELECTOR.toLowerCase())) return word(duplicate ? 1 : 0);
      if (data.startsWith(REGISTRY_GET_LATEST_REPORT_SELECTOR.toLowerCase())) return '0x1234';
      return '0x';
    }
    throw new Error(`unsupported ${method}`);
  });
}

test('existing transaction hash validation happens before provider access', async () => {
  const input = await context(); const mock = provider(() => { throw new Error('must not be called'); });
  assert.equal(isValidProofTransactionHash(TX_HASH), true); assert.equal(isValidProofTransactionHash('0x1234'), false);
  await assert.rejects(() => inspectExistingProofTransaction({ provider: mock, transactionHash: '0x1234', envelope: input.envelope, verification: input.verification, walletState: input.walletState }), (error) => error.code === 'WEB_V4_TX_INVALID');
  assert.equal(mock.calls.length, 0);
});

test('existing transaction inspection verifies chain, transaction, receipt and matching event', async () => {
  const input = await context(); const mock = reconciliationProvider(input);
  const result = await inspectExistingProofTransaction({ provider: mock, transactionHash: TX_HASH, envelope: input.envelope, verification: input.verification, walletState: input.walletState });
  assert.equal(result.status, 'verified'); assert.equal(result.match, true); assert.equal(result.receipt.status, 'confirmed'); assert.equal(result.identity.currentReportHash, input.envelope.reportHash);
  assert.deepEqual(mock.calls.slice(0, 3).map((call) => call.method), ['eth_chainId', 'eth_getTransactionByHash', 'eth_getTransactionReceipt']);
  assert.equal(mock.calls.some((call) => call.method === 'eth_sendTransaction'), false);
});

test('valid existing transaction with another report remains an explicit mismatch', async () => {
  const input = await context(); const otherReportHash = `0x${'cd'.repeat(32)}`;
  const mock = provider(({ method }) => {
    if (method === 'eth_chainId') return '0x4cef52';
    if (method === 'eth_getTransactionByHash') return { hash: TX_HASH, from: ACCOUNT, to: input.envelope.registryAddress, input: publishInput(otherReportHash), blockNumber: '0x10' };
    if (method === 'eth_getTransactionReceipt') return receipt(input.envelope, input.preflight, { logs: [publicationLog(input.envelope, input.preflight, { reportHash: otherReportHash })] });
    throw new Error(`unsupported ${method}`);
  });
  const result = await inspectExistingProofTransaction({ provider: mock, transactionHash: TX_HASH, envelope: input.envelope, verification: input.verification, walletState: input.walletState });
  assert.equal(result.status, 'report-hash-mismatch'); assert.equal(result.match, false); assert.equal(result.identity.transactionReportHash, `sha256:${'cd'.repeat(32)}`); assert.equal(result.identity.currentReportHash, input.envelope.reportHash);
});

test('existing transaction inspection exposes not-found, pending and reverted classifications', async () => {
  const input = await context();
  for (const [receiptValue, transactionValue, code] of [[null, null, 'WEB_V4_TX_NOT_FOUND'], [null, {}, 'WEB_V4_RECEIPT_PENDING'], [{ status: '0x0' }, {}, 'WEB_V4_RECEIPT_REVERTED']]) {
    const transaction = { hash: TX_HASH, from: ACCOUNT, to: input.envelope.registryAddress, input: publishInput(input.preflight.payload.reportHash), blockNumber: '0x10', ...transactionValue };
    const receiptValueFull = receiptValue && { ...receipt(input.envelope, input.preflight), ...receiptValue };
    const mock = provider(({ method }) => method === 'eth_chainId' ? '0x4cef52' : method === 'eth_getTransactionByHash' ? (transactionValue === null ? null : transaction) : receiptValueFull);
    await assert.rejects(() => inspectExistingProofTransaction({ provider: mock, transactionHash: TX_HASH, envelope: input.envelope, verification: input.verification, walletState: input.walletState }), (error) => error.code === code);
  }
});

test('existing transaction inspection reports provider unavailable without leaking provider details', async () => {
  const input = await context();
  await assert.rejects(() => inspectExistingProofTransaction({ provider: null, transactionHash: TX_HASH, envelope: input.envelope, verification: input.verification, walletState: input.walletState }), (error) => error.code === 'WEB_V4_PROVIDER_UNAVAILABLE' && !error.message.includes('secret'));
});

test('user-approved capability does not enable automatic sending', () => {
  assert.equal(WEB_PROOF_USER_APPROVED_SEND_ENABLED, true);
  assert.equal(WEB_PROOF_SEND_ENABLED, false);
});

test('transaction review shows the complete safe acceptance summary', () => {
  const html = renderTransactionSummary({ networkName: 'Arc Testnet', from: ACCOUNT, to: ACCOUNT, registryContractVersion: 2, chainId: 5_042_002, reportHash: 'sha256:hash', envelopeVersion: 'veilforge.proof.v4.1', schemaVersion: '4.1.0', hashPayloadVersion: 'veilforge.report.hash.v2', complete: false, incompleteReasonCodes: ['unsupported-expression'], value: '0x0', registryMethod: 'publishReport(bytes32,bytes32,bytes32,uint16,string,string)', calldataPreview: '0x1234…abcd', calldataBytes: 256, calldataDigest: 'sha256:calldata', gasEstimateStatus: 'unavailable', duplicate: false, duplicatePolicy: 'publisher-scoped-idempotent' });
  for (const value of ['Arc Testnet', '5042002', 'Registry contract', 'V2', '4.1.0', 'veilforge.report.hash.v2', 'unsupported-expression', '0x0', 'publishReport', '0x1234…abcd', 'unavailable', 'not found']) assert.match(html, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
});

test('publish rejects a missing trusted click without touching the provider', async () => {
  const input = await context(); const mock = provider(() => TX_HASH);
  await assert.rejects(() => submitUserApprovedProofTransaction({ ...input, provider: mock }), (error) => error.code === 'WEB_V4_USER_GESTURE_REQUIRED');
  assert.equal(mock.calls.length, 0);
});

test('publish rejects an untrusted or non-click event', async () => {
  const input = await context(); const mock = provider(() => TX_HASH);
  await assert.rejects(() => submitUserApprovedProofTransaction({ ...input, provider: mock, event: { type: 'click', isTrusted: false } }), (error) => error.code === 'WEB_V4_USER_GESTURE_REQUIRED');
  await assert.rejects(() => submitUserApprovedProofTransaction({ ...input, provider: mock, event: { type: 'change', isTrusted: true } }), (error) => error.code === 'WEB_V4_USER_GESTURE_REQUIRED');
  assert.equal(mock.calls.length, 0);
});

test('publish requires a completed review', async () => {
  const input = await context({ review: { reviewReady: false } }); const mock = provider(() => TX_HASH);
  await assert.rejects(() => submitUserApprovedProofTransaction({ ...input, provider: mock, event: click }), (error) => error.code === 'WEB_V4_SEND_DISABLED');
  assert.equal(mock.calls.length, 0);
});

test('duplicate registry state blocks send before provider invocation', async () => {
  const input = await context({ networkPreflight: { duplicate: true } }); const mock = provider(() => TX_HASH);
  await assert.rejects(() => submitUserApprovedProofTransaction({ ...input, provider: mock, event: click }), (error) => error.code === 'WEB_V4_PROOF_DUPLICATE');
  assert.equal(mock.calls.length, 0);
});

test('stale preflight binding blocks send', async () => {
  const input = await context({ currentStateBindingDigest: 'sha256:stale' }); const mock = provider(() => TX_HASH);
  await assert.rejects(() => submitUserApprovedProofTransaction({ ...input, provider: mock, event: click }), (error) => error.code === 'WEB_V4_SEND_DISABLED');
  assert.equal(mock.calls.length, 0);
});

test('tampered review digest blocks send', async () => {
  const input = await context(); input.review = { ...input.review, transactionDigest: 'sha256:tampered' }; const mock = provider(() => TX_HASH);
  await assert.rejects(() => submitUserApprovedProofTransaction({ ...input, provider: mock, event: click }), (error) => error.code === 'WEB_V4_TX_INVALID');
  assert.equal(mock.calls.length, 0);
});

test('trusted publish click sends exactly one deterministic transaction', async () => {
  const input = await context(); const mock = provider(() => TX_HASH);
  const pending = await submitUserApprovedProofTransaction({ ...input, provider: mock, event: click });
  assert.equal(pending.status, 'pending'); assert.equal(pending.transactionHash, TX_HASH);
  assert.deepEqual(mock.calls, [{ method: 'eth_sendTransaction', params: [input.preflight.transactionRequest] }]);
});

test('wallet transaction hash is normalized and explorer-bound', async () => {
  const input = await context(); const mock = provider(() => TX_HASH.toUpperCase().replace('0X', '0x'));
  const pending = await submitUserApprovedProofTransaction({ ...input, provider: mock, event: click });
  assert.equal(pending.transactionHash, TX_HASH); assert.match(pending.explorerUrl, new RegExp(`${TX_HASH}$`, 'u'));
});

test('invalid transaction hash fails closed', async () => {
  const input = await context();
  await assert.rejects(() => submitUserApprovedProofTransaction({ ...input, provider: provider(() => '0x1234'), event: click }), (error) => error.code === 'WEB_V4_TX_INVALID');
});

test('wallet rejection is classified without raw provider details', async () => {
  const input = await context();
  await assert.rejects(() => submitUserApprovedProofTransaction({ ...input, provider: provider(() => { throw Object.assign(new Error('secret raw message'), { code: 4001 }); }), event: click }), (error) => error.code === 'WEB_V4_USER_REJECTED' && !error.message.includes('secret'));
});

test('wallet failure is classified without raw provider details', async () => {
  const input = await context();
  await assert.rejects(() => submitUserApprovedProofTransaction({ ...input, provider: provider(() => { throw new Error('secret raw message'); }), event: click }), (error) => error.code === 'WEB_V4_TX_INVALID' && !error.message.includes('secret'));
});

test('unresolved wallet request times out within the configured bound', async () => {
  const input = await context(); const started = Date.now();
  await assert.rejects(() => submitUserApprovedProofTransaction({ ...input, provider: provider(() => new Promise(() => {})), event: click, timeoutMs: 50 }), (error) => error.code === 'WEB_V4_TIMEOUT');
  assert.ok(Date.now() - started < 500);
});

test('receipt polling validates a trusted success event', async () => {
  const input = await context(); const expectedReceipt = receipt(input.envelope, input.preflight);
  const result = await waitForVerifiedProofReceipt({ provider: provider(() => expectedReceipt), transactionHash: TX_HASH, envelope: input.envelope, verification: input.verification, publisher: ACCOUNT, providerChainId: input.walletState.chainId, timeoutMs: 250, pollIntervalMs: 0 });
  assert.equal(result.status, 'confirmed'); assert.equal(result.transactionHash, TX_HASH); assert.equal(result.reportHash, input.envelope.reportHash);
});

test('receipt polling tolerates pending null before confirmation', async () => {
  const input = await context(); const expectedReceipt = receipt(input.envelope, input.preflight);
  const mock = provider((_request, count) => count === 1 ? null : expectedReceipt);
  const result = await waitForVerifiedProofReceipt({ provider: mock, transactionHash: TX_HASH, envelope: input.envelope, verification: input.verification, publisher: ACCOUNT, providerChainId: input.walletState.chainId, timeoutMs: 250, pollIntervalMs: 0 });
  assert.equal(result.status, 'confirmed'); assert.equal(mock.calls.length, 2);
});

test('receipt polling rejects a receipt belonging to another transaction hash', async () => {
  const input = await context(); const otherHash = `0x${'cd'.repeat(32)}`;
  await assert.rejects(() => waitForVerifiedProofReceipt({ provider: reconciliationProvider(input, { receiptHash: otherHash }), transactionHash: TX_HASH, envelope: input.envelope, verification: input.verification, publisher: ACCOUNT, providerChainId: input.walletState.chainId, timeoutMs: 250, pollIntervalMs: 0 }), (error) => error.code === 'WEB_V4_TX_INVALID');
});

test('read-only reconciliation verifies receipt and closes duplicate send boundary', async () => {
  const input = await context(); const mock = reconciliationProvider(input);
  const result = await reconcileVerifiedProofPublication({ provider: mock, transactionHash: TX_HASH, envelope: input.envelope, verification: input.verification, walletState: input.walletState, disclosureAcknowledged: true, receiptTimeoutMs: 250, pollIntervalMs: 0, rpcTimeoutMs: 250 });
  assert.equal(result.status, 'already-published'); assert.equal(result.receipt.transactionHash, TX_HASH); assert.equal(result.networkPreflight.duplicate, true); assert.equal(result.preflight.transactionRequest, null);
  assert.equal(mock.calls.some((call) => call.method === 'eth_sendTransaction'), false);
});

test('reconciliation fails closed when live duplicate state is absent', async () => {
  const input = await context(); const mock = reconciliationProvider(input, { duplicate: false });
  await assert.rejects(() => reconcileVerifiedProofPublication({ provider: mock, transactionHash: TX_HASH, envelope: input.envelope, verification: input.verification, walletState: input.walletState, disclosureAcknowledged: true, receiptTimeoutMs: 250, pollIntervalMs: 0, rpcTimeoutMs: 250 }), (error) => error.code === 'WEB_V4_PROOF_DUPLICATE');
  assert.equal(mock.calls.some((call) => call.method === 'eth_sendTransaction'), false);
});

test('receipt polling timeout is bounded', async () => {
  const input = await context(); const started = Date.now();
  await assert.rejects(() => waitForVerifiedProofReceipt({ provider: provider(() => null), transactionHash: TX_HASH, envelope: input.envelope, verification: input.verification, publisher: ACCOUNT, providerChainId: input.walletState.chainId, timeoutMs: 50, pollIntervalMs: 5 }), (error) => error.code === 'WEB_V4_TIMEOUT');
  assert.ok(Date.now() - started < 500);
});

test('receipt polling honors cancellation before provider invocation', async () => {
  const input = await context(); const controller = new AbortController(); controller.abort(); const mock = provider(() => null);
  await assert.rejects(() => waitForVerifiedProofReceipt({ provider: mock, transactionHash: TX_HASH, envelope: input.envelope, verification: input.verification, publisher: ACCOUNT, providerChainId: input.walletState.chainId, signal: controller.signal }), (error) => error.code === 'WEB_V4_ABORTED');
  assert.equal(mock.calls.length, 0);
});

test('reverted receipt is not confirmed', async () => {
  const input = await context(); const reverted = receipt(input.envelope, input.preflight, { status: '0x0' });
  await assert.rejects(() => waitForVerifiedProofReceipt({ provider: provider(() => reverted), transactionHash: TX_HASH, envelope: input.envelope, verification: input.verification, publisher: ACCOUNT, providerChainId: input.walletState.chainId }), (error) => error.code === 'WEB_V4_RECEIPT_REVERTED');
});

test('mismatched publication event is not confirmed', async () => {
  const input = await context(); const mismatch = receipt(input.envelope, input.preflight, { logs: [publicationLog(input.envelope, input.preflight, { reportHash: `0x${'cd'.repeat(32)}` })] });
  await assert.rejects(() => waitForVerifiedProofReceipt({ provider: provider(() => mismatch), transactionHash: TX_HASH, envelope: input.envelope, verification: input.verification, publisher: ACCOUNT, providerChainId: input.walletState.chainId }), (error) => error.code === 'WEB_V4_EVENT_MISMATCH');
});

test('post-success duplicate check prevents a second transaction', async () => {
  const input = await context(); const mock = provider(() => TX_HASH);
  await submitUserApprovedProofTransaction({ ...input, provider: mock, event: click });
  const duplicate = { ...input, networkPreflight: { ...input.networkPreflight, duplicate: true } };
  await assert.rejects(() => submitUserApprovedProofTransaction({ ...duplicate, provider: mock, event: click }), (error) => error.code === 'WEB_V4_PROOF_DUPLICATE');
  assert.equal(mock.calls.length, 1);
});
