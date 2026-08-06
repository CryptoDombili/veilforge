import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deriveV4WorkflowState, v4AnalysisPhase, v4UiTemplate } from '../../../apps/web/v4/ui.js';

const reportHash = `sha256:${'a'.repeat(64)}`;
const verification = Object.freeze({
  verified: true,
  reportHash,
  report: Object.freeze({
    schemaVersion: '4.1.0',
    integrity: Object.freeze({ verified: true, reportHash, hashPayloadVersion: 'veilforge.report.hash.v2' }),
  }),
});
const configured = { projectName: 'Local project', fileCount: 1, domainCount: 1, inputError: null };
const scanned = { ...configured, scanStatus: 'verified', verification, findingCount: 2, reviewReady: true, verifyReady: true, proofAvailable: true };

test('workflow completion derives from validated product state, never scroll position', () => {
  assert.equal(deriveV4WorkflowState(configured).completion.configure, true);
  assert.equal(deriveV4WorkflowState({ ...configured, projectName: '' }).completion.configure, false);
  assert.equal(deriveV4WorkflowState({ ...configured, fileCount: 0 }).completion.configure, false);
  assert.equal(deriveV4WorkflowState({ ...configured, domainCount: 0 }).completion.configure, false);
  assert.equal(deriveV4WorkflowState({ ...configured, inputError: 'invalid' }).completion.configure, false);
  assert.equal(deriveV4WorkflowState({ ...configured, scanStatus: 'error', verification }).completion.scan, false);
  assert.equal(deriveV4WorkflowState(scanned).completion.scan, true);
  assert.equal(deriveV4WorkflowState(scanned).completion.verify, false);
  assert.equal(deriveV4WorkflowState(scanned).active, 'review');
});

test('active workflow follows scanning, rendered review and verify-ready state without early advancement', () => {
  const scanning = deriveV4WorkflowState({ ...scanned, scanStatus: 'scanning' });
  assert.equal(scanning.active, 'scan');
  assert.equal(scanning.completion.scan, false);
  assert.equal(scanning.completion.review, false);
  assert.equal(scanning.completion.verify, false);

  const rendered = deriveV4WorkflowState(scanned);
  assert.equal(rendered.active, 'review');
  assert.equal(rendered.completion.scan, true);
  assert.equal(rendered.completion.review, false);
  assert.equal(rendered.completion.verify, false);

  const verifyReady = deriveV4WorkflowState({ ...scanned, reviewedFinding: true });
  assert.equal(verifyReady.active, 'verify');
  assert.equal(verifyReady.completion.review, true);
  assert.equal(verifyReady.completion.verify, true);

  assert.equal(deriveV4WorkflowState({ ...scanned, reviewedFinding: true, proofStatus: 'preflight-checking' }).active, 'publish');
  assert.equal(deriveV4WorkflowState({ ...scanned, reviewedFinding: true, exported: true }).active, 'export');
});

test('current-session reset invalidates every completed step while preserving reusable configuration', () => {
  const reset = deriveV4WorkflowState({ ...scanned, reviewedFinding: true, exported: true, sessionReset: true });
  assert.equal(reset.active, 'configure');
  assert.equal(reset.completion.configure, false);
  assert.equal(reset.accessible.scan, true);
  assert.deepEqual({ scan: reset.completion.scan, review: reset.completion.review, verify: reset.completion.verify, publish: reset.completion.publish, export: reset.completion.export }, { scan: false, review: false, verify: false, publish: false, export: false });
});

test('review and export remain session actions while verified history restores configure scan and verify', () => {
  const untouched = deriveV4WorkflowState(scanned);
  assert.equal(untouched.completion.review, false);
  assert.equal(untouched.completion.export, false);
  const acted = deriveV4WorkflowState({ ...scanned, reviewedFinding: true, exported: true });
  assert.equal(acted.completion.review, true);
  assert.equal(acted.completion.export, true);
  const restored = deriveV4WorkflowState({ restoredReport: true, scanStatus: 'verified', verification, findingCount: 2, reviewReady: true, verifyReady: true, proofAvailable: true });
  assert.equal(restored.completion.configure, true);
  assert.equal(restored.completion.scan, true);
  assert.equal(restored.completion.verify, false);
  assert.equal(restored.completion.review, false);
  assert.equal(restored.completion.export, false);
});

test('publish completes only with a provider-verified confirmed identity', () => {
  const receipt = { status: 'confirmed', transactionHash: `0x${'b'.repeat(64)}` };
  assert.equal(deriveV4WorkflowState({ ...scanned, proofStatus: 'confirmed', proofReceipt: receipt }).completion.publish, false);
  assert.equal(deriveV4WorkflowState({ ...scanned, proofIdentityVerified: true, proofStatus: 'pending', proofReceipt: receipt }).completion.publish, false);
  assert.equal(deriveV4WorkflowState({ ...scanned, proofIdentityVerified: true, proofStatus: 'already-published', proofReceipt: receipt }).completion.publish, false);
  assert.equal(deriveV4WorkflowState({ ...scanned, proofIdentityVerified: true, proofCompletionState: 'existing-proof-verified', proofStatus: 'already-published', proofReceipt: receipt }).completion.publish, true);
  assert.equal(deriveV4WorkflowState({ ...scanned, proofIdentityVerified: true, proofCompletionState: 'new-transaction-reconciled', proofStatus: 'already-published', proofReceipt: receipt }).completion.publish, true);
  assert.equal(deriveV4WorkflowState({ ...scanned, proofIdentityVerified: true, proofCompletionState: 'new-transaction-reconciled', proofStatus: 'pending', proofReceipt: receipt }).completion.publish, false);
  const unavailable = deriveV4WorkflowState({ ...scanned, proofAvailable: false });
  assert.equal(unavailable.accessible.publish, false);
  assert.match(unavailable.reasons.publish, /unavailable/u);
});

test('worker stages map to the six visible analysis phases without synthetic progress', () => {
  assert.deepEqual(['compilation', 'ir', 'graphs', 'interprocedural', 'detectors', 'report-integrity'].map(v4AnalysisPhase), ['Compiler', 'AST', 'CFG', 'Dataflow', 'Detectors', 'Report']);
  const html = v4UiTemplate();
  for (const state of ['v4-analysis-visual', 'v4-analysis-state', 'v4-analysis-title', 'v4-analysis-detail']) assert.match(html, new RegExp(`id="${state}"`, 'u'));
  for (const phase of ['Compiler', 'AST', 'CFG', 'Dataflow', 'Detectors', 'Report']) assert.match(html, new RegExp(`data-v4-phase="${phase}"`, 'u'));
  assert.match(html, /v4-analysis-axis axis-primary/u);
  assert.match(html, /v4-analysis-node node-verified/u);
  assert.doesNotMatch(html, /canvas|webgl/iu);
});

test('sticky, reduced-motion and fail-closed release boundaries remain explicit', () => {
  const css = fs.readFileSync(new URL('../../../apps/web/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.v4-intake-stack\{[^}]*max-height:calc\(100vh - var\(--v4-rail-top\) - 16px\)[^}]*position:sticky/su);
  assert.match(css, /\.v4-intake-stack\{[^}]*gap:14px[^}]*overflow-y:clip/su);
  assert.match(css, /@media\(min-width:1025px\) and \(max-height:799px\)\{\.v4-intake-stack\{overflow-y:auto\}\}/u);
  assert.doesNotMatch(css, /\.v4-intake-stack\{[^}]*scrollbar-gutter:stable/su);
  assert.match(css, /\.v4-intake-stack>\.v4-intake\{[^}]*border:1px[^}]*border-radius:15px/su);
  assert.match(css, /\.v4-analysis-visual\{[^}]*border:1px[^}]*min-height:clamp\(252px,24vh,292px\)/su);
  assert.match(css, /body\.v4-ui-mode\{[^}]*overflow-x:clip!important;overflow-y:visible!important/su);
  assert.match(css, /@media\(max-width:1024px\)[\s\S]*\.v4-intake-stack\{[^}]*position:static/su);
  assert.match(css, /prefers-reduced-motion:reduce/u);
  assert.match(css, /v4-document-hidden/u);
  const webConfig = fs.readFileSync(new URL('../../../apps/web/config.js', import.meta.url), 'utf8');
  const mainnet = fs.readFileSync(new URL('../../../packages/proof/v4/mainnet-readiness.js', import.meta.url), 'utf8');
  assert.match(webConfig, /WEB_V4_ENABLED = false/u);
  assert.match(mainnet, /enabled: false[\s\S]*publishEnabled: false[\s\S]*proofReadEnabled: false/u);
});
