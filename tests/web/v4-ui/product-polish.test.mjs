import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { proofSectionTemplate, renderPreflightChecks, renderProofSummary, renderTransactionSummary } from '../../../apps/web/v4/proof-ui.js';
import { v4UiTemplate } from '../../../apps/web/v4/ui.js';
import { report } from '../../v4/report/helpers.mjs';
import { verifyV4Report } from '../../../apps/web/v4/report-adapter.js';
import { createWebProofEnvelope } from '../../../apps/web/v4/proof-adapter.js';

test('V4 surface presents the product journey and progressive disclosure', () => {
  const html = v4UiTemplate();
  for (const step of ['Configure', 'Scan', 'Review', 'Verify', 'Publish', 'Export']) assert.match(html, new RegExp(`>\\s*${step}<`, 'u'));
  assert.match(html, /VEILFORGE V4 GRANT CANDIDATE/u);
  assert.match(html, /id="v4-controls"[^>]*open/u);
  assert.match(html, /Advanced filters and sorting/u);
  assert.match(html, /id="v4-toast"[^>]*aria-live="polite"/u);
  const source = fs.readFileSync(new URL('../../../apps/web/v4/ui.js', import.meta.url), 'utf8');
  assert.match(source, /data-v4-history-export/u);
  assert.match(source, /Verified on Arc Testnet/u);
  assert.match(source, /Already published — second transaction blocked/u);
  assert.match(source, /v4-proof-workflow'\)\.hidden = published/u);
});

test('proof and transaction detail remain collapsed until requested', async () => {
  const envelope = await createWebProofEnvelope(await verifyV4Report(report()));
  const proof = renderProofSummary(envelope);
  assert.match(proof, /Verified report ready/u);
  assert.match(proof, /<details class="v4-proof-technical">/u);
  assert.match(proofSectionTemplate(), /id="v4-proof-workflow"[^>]*hidden/u);
  const checks = renderPreflightChecks({ checks: [{ id: 'trusted-chain', passed: true, message: 'ok' }] });
  assert.match(checks, /1\/1 preflight checks passed/u);
  assert.doesNotMatch(checks, /<details[^>]* open/u);
  const transaction = renderTransactionSummary({ networkName: 'Arc Testnet', from: '0x1111111111111111111111111111111111111111', to: '0x2222222222222222222222222222222222222222', reportHash: envelope.reportHash, value: '0', gasEstimateStatus: 'passed', duplicate: false, registryMethod: 'publishReport', chainId: '0x1', calldataBytes: 4 });
  assert.match(transaction, /Advanced transaction details/u);
  assert.match(transaction, /Duplicate check/u);
});

test('responsive polish covers required widths without changing the V3 source default', () => {
  const css = fs.readFileSync(new URL('../../../apps/web/styles.css', import.meta.url), 'utf8');
  for (const width of ['1280', '1024', '768', '430']) assert.match(css, new RegExp(`max-width:${width}px`, 'u'));
  assert.match(css, /body\.v4-ui-mode/u);
  const config = fs.readFileSync(new URL('../../../apps/web/config.js', import.meta.url), 'utf8');
  assert.match(config, /WEB_V4_ENABLED = false/u);
  const landing = fs.readFileSync(new URL('../../../apps/web/index.html', import.meta.url), 'utf8');
  assert.match(landing, /VeilForge v3\.2\.2/u);
});

test('V4 preview build rewrites only copied landing content', () => {
  const build = fs.readFileSync(new URL('../../../scripts/build-web.mjs', import.meta.url), 'utf8');
  assert.match(build, /if \(webV4Enabled\)/u);
  assert.match(build, /VeilForge V4 Grant Candidate/u);
  assert.match(build, /Launch V4 Scanner/u);
});
