import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createV4ProofEnvelope } from '../../../packages/proof/v4/envelope.js';
import { createWebProofEnvelope } from '../../../apps/web/v4/proof-adapter.js';
import { createProofSummary, proofSectionTemplate, renderProofExplorerLink, renderProofSummary } from '../../../apps/web/v4/proof-ui.js';
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
  for (const id of ['v4-proof', 'v4-proof-status', 'v4-proof-summary', 'v4-proof-checks', 'v4-proof-preflight', 'v4-proof-transaction']) assert.match(html, new RegExp(`id="${id}"`, 'u'));
  assert.match(html, /Transaction submission is disabled/u);
});

test('proof UI exposes a bounded registry reverify action', () => {
  const source = fs.readFileSync(new URL('../../../apps/web/v4/ui.js', import.meta.url), 'utf8');
  assert.match(source, /Reverify registry status/u);
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

test('verified transaction explorer link is isolated from the opener', () => {
  const transactionHash = `0x${'ab'.repeat(32)}`;
  const html = renderProofExplorerLink({ transactionHash, explorerUrl: `https://testnet.arcscan.app/tx/${transactionHash}` });
  assert.match(html, /target="_blank"/u); assert.match(html, /rel="noopener noreferrer"/u);
  assert.equal(renderProofExplorerLink({ transactionHash, explorerUrl: 'javascript:alert(1)' }), '');
});
