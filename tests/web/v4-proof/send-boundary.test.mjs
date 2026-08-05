import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { connectWalletOnUserGesture } from '../../../apps/web/v4/proof-connect-boundary.js';
import { createUserGatedProofReview, WEB_PROOF_SEND_ENABLED } from '../../../apps/web/v4/proof-send-boundary.js';
import { proofSectionTemplate } from '../../../apps/web/v4/proof-ui.js';
import { DEFAULT_WEB_V4_ENABLED } from '../../../apps/web/v4/feature-flags.js';
import { V3_STORAGE_PREFIX } from '../../../apps/web/v4/persistence.js';
import { ACCOUNT, incompleteReport, readyProof } from './helpers.mjs';

function connectProvider(accounts = [ACCOUNT]) {
  const calls = [];
  return { calls, async request({ method }) { calls.push(method); if (method === 'eth_requestAccounts') return accounts; throw new Error('unsupported'); } };
}

const network = (overrides = {}) => ({ passed: true, status: 'passed', stateBindingDigest: 'sha256:state', gasEstimateStatus: 'estimated', gasEstimate: '0x10000', ...overrides });

async function reviewInput(overrides = {}) {
  const proof = await readyProof(overrides.proofOptions);
  const networkPreflight = overrides.networkPreflight ?? network();
  return { envelope: proof.envelope, preflight: overrides.preflight ?? proof.preflight, networkPreflight, disclosureAcknowledged: overrides.disclosureAcknowledged ?? true, userGesture: overrides.userGesture ?? true, reviewAcknowledged: overrides.reviewAcknowledged ?? true, currentStateBindingDigest: overrides.currentStateBindingDigest ?? networkPreflight.stateBindingDigest };
}

test('wallet connect is impossible without an explicit user gesture', async () => {
  const provider = connectProvider();
  await assert.rejects(() => connectWalletOnUserGesture(provider), (error) => error.code === 'WEB_V4_USER_GESTURE_REQUIRED');
  assert.deepEqual(provider.calls, []);
});

test('explicit connect action can request accounts through the isolated boundary', async () => {
  const provider = connectProvider(); const result = await connectWalletOnUserGesture(provider, { userGesture: true, timeoutMs: 250 });
  assert.equal(result.account, ACCOUNT); assert.deepEqual(provider.calls, ['eth_requestAccounts']);
});

test('connect boundary rejects a provider with no account', async () => {
  await assert.rejects(() => connectWalletOnUserGesture(connectProvider([]), { userGesture: true, timeoutMs: 250 }), (error) => error.code === 'WEB_V4_ACCOUNT_UNAVAILABLE');
});

test('safe transaction review becomes ready but send remains hard disabled', async () => {
  const result = await createUserGatedProofReview(await reviewInput());
  assert.equal(result.reviewReady, true); assert.equal(result.sendEnabled, false); assert.equal(WEB_PROOF_SEND_ENABLED, false);
  assert.match(result.sendDisabledReason, /disabled in this preflight build/u);
});

test('review requires an explicit user gesture and acknowledgement', async () => {
  const noGesture = await createUserGatedProofReview(await reviewInput({ userGesture: false }));
  const noAck = await createUserGatedProofReview(await reviewInput({ reviewAcknowledged: false }));
  assert.ok(noGesture.blockingReasons.includes('user-gesture')); assert.ok(noAck.blockingReasons.includes('review-acknowledged'));
});

test('incomplete proof remains blocked without disclosure acknowledgement', async () => {
  const input = await reviewInput({ proofOptions: { report: incompleteReport(), disclosureAcknowledged: true }, disclosureAcknowledged: false });
  const result = await createUserGatedProofReview(input);
  assert.ok(result.blockingReasons.includes('incomplete-disclosure'));
});

test('tampered transaction request is blocked at review', async () => {
  const input = await reviewInput();
  input.preflight = { ...input.preflight, transactionRequest: { ...input.preflight.transactionRequest, value: '0x1' } };
  const result = await createUserGatedProofReview(input);
  assert.ok(result.blockingReasons.includes('transaction-request-safe'));
});

test('account chain or registry state changes invalidate the review binding', async () => {
  const input = await reviewInput({ currentStateBindingDigest: 'sha256:changed' });
  const result = await createUserGatedProofReview(input);
  assert.ok(result.blockingReasons.includes('state-binding-current'));
});

test('failed network preflight blocks review', async () => {
  const result = await createUserGatedProofReview(await reviewInput({ networkPreflight: network({ passed: false, status: 'wrong-network' }) }));
  assert.ok(result.blockingReasons.includes('network-preflight-passed'));
});

test('UI exposes distinct Connect Wallet and Review & Publish actions with disabled send', () => {
  const html = proofSectionTemplate();
  assert.match(html, />Connect Wallet</u); assert.match(html, />Review &amp; Publish Proof</u); assert.match(html, /id="v4-proof-send"[^>]*disabled/u);
  assert.match(html, /Transaction sending is disabled in this preflight build/u);
});

test('automatic send and automatic chain switch are absent', () => {
  const files = ['proof-network-preflight.js', 'proof-send-boundary.js', 'ui.js'];
  const source = files.map((name) => fs.readFileSync(new URL(`../../../apps/web/v4/${name}`, import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(source, /eth_sendTransaction|wallet_switchEthereumChain|wallet_addEthereumChain/u);
  const connectSource = fs.readFileSync(new URL('../../../apps/web/v4/proof-connect-boundary.js', import.meta.url), 'utf8');
  assert.ok(connectSource.indexOf('userGesture !== true') < connectSource.indexOf("method: 'eth_requestAccounts'"));
});

test('V3 namespace and default false feature flag remain unchanged', () => {
  assert.equal(V3_STORAGE_PREFIX, 'veilforge:v3.2:'); assert.equal(DEFAULT_WEB_V4_ENABLED, false);
});
