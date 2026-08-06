import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createV4ProofEnvelope } from '../../../packages/proof/v4/envelope.js';
import { createWebProofEnvelope } from '../../../apps/web/v4/proof-adapter.js';
import { createProofSummary, deriveProofWalletUiState, proofSectionTemplate, renderExistingTransactionVerification, renderPreflightChecks, renderProofExplorerLink, renderProofSummary } from '../../../apps/web/v4/proof-ui.js';
import { v4ErrorMessage, v4UiTemplate } from '../../../apps/web/v4/ui.js';
import { currentReport, incompleteReport, verification } from './helpers.mjs';

test('verified V4 report produces a visible proof section', async () => {
  const envelope = await createWebProofEnvelope(await verification());
  const html = renderProofSummary(envelope);
  assert.match(html, /Report hash/u); assert.match(html, /veilforge\.proof\.v4\.1/u);
});

test('browser envelope matches Phase 5C-1 canonical proof identity', async () => {
  const report = currentReport();
  const webEnvelope = await createWebProofEnvelope(await verification(report));
  const coreEnvelope = createV4ProofEnvelope(report);
  assert.equal(webEnvelope.canonicalPayloadDigest, coreEnvelope.canonicalPayloadDigest);
});

test('complete report summary is ready without incomplete warning', async () => {
  const summary = createProofSummary(await createWebProofEnvelope(await verification()));
  assert.equal(summary.complete, true); assert.deepEqual(summary.incompleteReasonCodes, []);
});

test('incomplete report shows warning and reason codes', async () => {
  const html = renderProofSummary(await createWebProofEnvelope(await verification(incompleteReport())));
  assert.match(html, /Incomplete analysis/u); assert.match(html, /unsupported-expression/u); assert.match(html, /does not certify confidentiality/u);
});

test('proof template requires explicit incomplete acknowledgement', () => {
  const html = proofSectionTemplate();
  assert.match(html, /id="v4-proof-ack"/u); assert.match(html, /does not certify confidentiality/u);
});

test('proof summary contains trusted network and shortened registry', async () => {
  const html = renderProofSummary(await createWebProofEnvelope(await verification()));
  assert.match(html, /Arc Testnet/u); assert.match(html, /5042002/u); assert.doesNotMatch(html, /contract Case/u);
});

test('V4 preview template includes proof status, checks and transaction boundary', () => {
  const html = v4UiTemplate();
  for (const id of ['v4-proof', 'v4-proof-status', 'v4-proof-summary', 'v4-proof-checks', 'v4-proof-preflight', 'v4-proof-transaction', 'v4-proof-reconcile-hash', 'v4-proof-reconcile']) assert.match(html, new RegExp(`id="${id}"`, 'u'));
  assert.match(html, /Publishing always requires a separate explicit click/u);
  assert.match(html, /No signature, network switch, or transaction request is made automatically/u);
});

test('proof UI exposes a bounded registry reverify action', () => {
  const source = fs.readFileSync(new URL('../../../apps/web/v4/ui.js', import.meta.url), 'utf8');
  assert.match(source, /Reverify registry status/u);
});

test('production UI exposes no mock receipt acceptance boundary', () => {
  const source = fs.readFileSync(new URL('../../../apps/web/v4/ui.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /acceptMockReceipt/u); assert.match(source, /reconcileProofTransaction/u);
  assert.match(source, /loadVerifiedWebProofPublication/u); assert.match(source, /state\.proof\.status = 'already-published'/u);
});

test('proof errors are source-free', () => {
  assert.doesNotMatch(v4ErrorMessage({ code: 'WEB_V4_PROOF_ENVELOPE_INVALID', message: 'C:\\secret\\Case.sol contract Case' }), /secret|Case\.sol|contract Case/u);
});

test('responsive rules cover desktop tablet and mobile proof layouts', () => {
  const css = fs.readFileSync(new URL('../../../apps/web/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.v4-proof-grid/u); assert.match(css, /max-width: 1100px/u); assert.match(css, /max-width: 760px/u); assert.match(css, /max-width: 430px/u);
});

test('proof UI has semantic live status and keyboard-labelled controls', () => {
  const html = proofSectionTemplate();
  assert.match(html, /aria-labelledby="v4-proof-title"/u); assert.match(html, /role="status" aria-live="polite"/u); assert.match(html, /<label for="v4-proof-ack">/u);
});

test('wallet UI reflects disconnected connected wrong-network and account-change states', () => {
  const chainId = 5_042_002;
  assert.equal(deriveProofWalletUiState({ providerAvailable: true, connected: false }, chainId).label, 'Connect Wallet');
  const connected = deriveProofWalletUiState({ providerAvailable: true, connected: true, account: '0x1111111111111111111111111111111111111111', chainId }, chainId);
  assert.equal(connected.state, 'connected'); assert.match(connected.label, /^Connected · /u); assert.equal(connected.disabled, true);
  const wrong = deriveProofWalletUiState({ providerAvailable: true, connected: true, account: '0x1111111111111111111111111111111111111111', chainId: 1 }, chainId);
  assert.equal(wrong.state, 'wrong-network'); assert.match(wrong.label, /^Wrong network/u); assert.equal(wrong.disabled, true);
  const changed = deriveProofWalletUiState({ providerAvailable: true, connected: true, account: '0x2222222222222222222222222222222222222222', chainId }, chainId);
  assert.notEqual(changed.label, connected.label);
});

test('provider unavailable and connecting wallet states fail closed', () => {
  const unavailable = deriveProofWalletUiState({}, 5_042_002);
  assert.equal(unavailable.label, 'Wallet unavailable'); assert.equal(unavailable.disabled, true);
  const connecting = deriveProofWalletUiState({ providerAvailable: true }, 5_042_002, { connecting: true });
  assert.equal(connecting.label, 'Connecting…'); assert.equal(connecting.disabled, true);
});

test('existing-proof-only checks render as neutral not-required outcomes', () => {
  const html = renderPreflightChecks({ checks: [
    { id: 'duplicate-lookup', passed: true, applicable: true, message: 'Registry record exists.' },
    { id: 'publish-preflight-passed', passed: false, applicable: false, message: 'Not applicable — existing proof verified.' },
    { id: 'transaction-request-safe', passed: false, applicable: false, message: 'Not required — no transaction request required.' },
  ] });
  assert.match(html, /1\/1 required checks passed · 2 not required/u);
  assert.equal((html.match(/class="not-required"/gu) ?? []).length, 2);
  assert.doesNotMatch(html, /class="blocked"[^>]*>[\s\S]*publish-preflight-passed/u);
});

test('verified transaction explorer link is isolated from the opener', () => {
  const transactionHash = `0x${'ab'.repeat(32)}`;
  const html = renderProofExplorerLink({ transactionHash, explorerUrl: `https://testnet.arcscan.app/tx/${transactionHash}` });
  assert.match(html, /target="_blank"/u); assert.match(html, /rel="noopener noreferrer"/u);
  assert.equal(renderProofExplorerLink({ transactionHash, explorerUrl: 'javascript:alert(1)' }), '');
});

test('existing transaction verification renders loading, success, mismatch and retryable errors', () => {
  const identity = { transactionHash: `0x${'ab'.repeat(32)}`, blockNumber: 55_469_453, publisher: '0x1111111111111111111111111111111111111111', registryAddress: '0x88B4055eaB061CEa9BdfeFF524f65ff461B5401d', transactionReportHash: `sha256:${'cd'.repeat(32)}`, currentReportHash: `sha256:${'ef'.repeat(32)}`, explorerUrl: `https://testnet.arcscan.app/tx/0x${'ab'.repeat(32)}` };
  assert.match(renderExistingTransactionVerification({ status: 'verifying' }), /Verifying existing Arc Testnet transaction/u);
  assert.match(renderExistingTransactionVerification({ status: 'verified', identity }), /No new transaction is required/u);
  const mismatch = renderExistingTransactionVerification({ status: 'report-hash-mismatch', identity });
  for (const text of ['REPORT HASH MISMATCH', 'Transaction report hash', 'Current report hash', 'View transaction']) assert.match(mismatch, new RegExp(text, 'u'));
  assert.match(renderExistingTransactionVerification({ status: 'invalid-input', message: 'Enter a valid hash.' }), /Invalid transaction hash/u);
  assert.match(renderExistingTransactionVerification({ status: 'error', message: 'Transaction not found.' }), /Verification failed/u);
});

test('existing transaction action is request-scoped and never routes through send', () => {
  const source = fs.readFileSync(new URL('../../../apps/web/v4/ui.js', import.meta.url), 'utf8');
  assert.match(source, /const requestId = \+\+state\.proof\.verificationRequestId/u);
  assert.match(source, /requestId !== state\.proof\.verificationRequestId/u);
  assert.match(source, /isValidProofTransactionHash\(transactionHash\)/u);
  assert.match(source, /inspectExistingProofTransaction\(/u);
  assert.match(source, /REPORT HASH MISMATCH|report-hash-mismatch/u);
  assert.match(source, /v4-proof-reconcile'\)\.addEventListener\('click', \(\) => \{ void verifyExistingTransaction\(\); \}\)/u);
});
