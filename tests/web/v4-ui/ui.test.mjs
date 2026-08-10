import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { browserFilesToScanInput } from '../../../apps/web/v4/input-adapter.js';
import { filterAndSortV4Findings, v4ErrorMessage, v4SourceDisplayPath, v4SourceRowsTemplate, v4UiTemplate } from '../../../apps/web/v4/ui.js';

const finding = (overrides = {}) => ({ findingId: 'f-1', detectorId: 'payments.event', domain: 'arc-payments', severity: 'high', disposition: 'detected', title: 'Payment event disclosure', summary: 'Sensitive value reaches an event.', sourceClass: 'payment-amount', sinkClass: 'event', primaryLocation: { sourcePath: 'src/A.sol', startLine: 4, startColumn: 2 }, ...overrides });

test('V4 mode is an explicit flag branch and V3 remains the default path', () => {
  const source = fs.readFileSync(new URL('../../../apps/web/app.js', import.meta.url), 'utf8');
  assert.match(source, /if \(WEB_V4_ENABLED\) \{[\s\S]*await initV4Ui\(\);[\s\S]*return;/u);
  assert.match(source, /bindEvents\(\);[\s\S]*await hydrateWallet\(\);/u);
});

test('finding controls filter and deterministically sort canonical V4 findings', () => {
  const findings = [finding(), finding({ findingId: 'f-2', detectorId: 'treasury.return', domain: 'arc-treasury', severity: 'critical', title: 'Treasury return disclosure' })];
  assert.deepEqual(filterAndSortV4Findings(findings).map((item) => item.findingId), ['f-2', 'f-1']);
  assert.deepEqual(filterAndSortV4Findings(findings, { domain: 'arc-payments', query: 'event' }).map((item) => item.findingId), ['f-1']);
  assert.deepEqual(filterAndSortV4Findings(findings, { sort: 'detector' }).map((item) => item.findingId), ['f-1', 'f-2']);
});

test('UI exposes V4 scan configuration, verified findings, details, history and exports', () => {
  const html = v4UiTemplate();
  for (const id of ['v4-project-name', 'v4-file-input', 'v4-folder-input', 'v4-policy-mode', 'v4-scan', 'v4-cancel', 'v4-progress', 'v4-summary', 'v4-findings', 'v4-detail', 'v4-history', 'v3-history', 'v4-export']) assert.match(html, new RegExp(`id="${id}"`, 'u'));
  assert.match(html, /solc 0\.8\.24/u); assert.match(html, /1 MiB MAX/u);
  const source = fs.readFileSync(new URL('../../../apps/web/v4/ui.js', import.meta.url), 'utf8');
  assert.match(source, /Evaluate in CLI\/CI/u);
});

test('local source rows remove only the browser root and safely expose the full display path', async () => {
  const content = new TextEncoder().encode('pragma solidity 0.8.24; contract ArcTreasury {}');
  const nested = { name: 'ArcTreasury.sol', size: content.byteLength, webkitRelativePath: 'VeilForgeScannerTestPack/VeilForgeScannerTestPack/contracts/deep/ArcTreasury.sol', async arrayBuffer() { return content.slice().buffer; } };
  const short = { name: 'A.sol', size: 12 };
  assert.equal(v4SourceDisplayPath(nested), 'VeilForgeScannerTestPack/contracts/deep/ArcTreasury.sol');
  assert.equal(v4SourceDisplayPath(short), 'A.sol');
  const input = await browserFilesToScanInput([nested], { projectId: 'display-boundary', domains: ['arc-treasury'] });
  assert.deepEqual(Object.keys(input.sources), ['VeilForgeScannerTestPack/contracts/deep/ArcTreasury.sol']);
  assert.equal(nested.webkitRelativePath, 'VeilForgeScannerTestPack/VeilForgeScannerTestPack/contracts/deep/ArcTreasury.sol');
  const html = v4SourceRowsTemplate([nested, short, { name: 'unsafe.sol', size: 1, relativePath: 'Root/src/<unsafe>.sol' }]);
  assert.match(html, /title="VeilForgeScannerTestPack\/contracts\/deep\/ArcTreasury\.sol">VeilForgeScannerTestPack\/contracts\/deep\/ArcTreasury\.sol<\/span><small>47 B<\/small>/u);
  assert.match(html, /title="A\.sol">A\.sol<\/span><small>12 B<\/small>/u);
  assert.match(html, /title="src\/&lt;unsafe&gt;\.sol">src\/&lt;unsafe&gt;\.sol<\/span>/u);
  assert.doesNotMatch(html, /title="[^"]*<unsafe>/u);
});

test('local source list constrains rows, ellipsizes paths, and keeps vertical scrolling', () => {
  const css = fs.readFileSync(new URL('../../../apps/web/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.v4-files \{[^}]*min-width: 0;[^}]*overflow-x: hidden;[^}]*overflow-y: auto;/su);
  assert.match(css, /\.v4-files > div \{[^}]*min-width: 0;[^}]*max-width: 100%;/su);
  assert.match(css, /\.v4-files span \{[^}]*flex: 1 1 auto;[^}]*min-width: 0;[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/su);
  assert.match(css, /\.v4-files small \{[^}]*flex: none;/su);
});

test('controlled errors do not expose worker internals or source content', () => {
  assert.match(v4ErrorMessage({ code: 'WEB_V4_RUNTIME_UNAVAILABLE', message: 'secret source' }), /unavailable/u);
  assert.doesNotMatch(v4ErrorMessage({ code: 'WEB_V4_WORKER_CRASH', message: 'PRIVATE_SENTINEL' }), /PRIVATE_SENTINEL/u);
  assert.match(v4ErrorMessage({ code: 'WEB_V4_COMPILE_FAILED', message: 'PRIVATE_SENTINEL' }), /exact solc 0\.8\.24/u);
  assert.doesNotMatch(v4ErrorMessage({ code: 'WEB_V4_COMPILE_FAILED', message: 'PRIVATE_SENTINEL' }), /PRIVATE_SENTINEL/u);
});

test('a new scan clears previously rendered verified evidence before worker execution', () => {
  const source = fs.readFileSync(new URL('../../../apps/web/v4/ui.js', import.meta.url), 'utf8');
  const start = source.slice(source.indexOf('const runScan = async'), source.indexOf('const client = createWorkerClient()'));
  assert.match(start, /state\.verification = null; state\.viewModel = null; state\.exportBundle = null;\s*clearRenderedReport\(\);/u);
});

test('Clear and Cancel share a bounded current-session reset without deleting local history', () => {
  const source = fs.readFileSync(new URL('../../../apps/web/v4/ui.js', import.meta.url), 'utf8');
  assert.match(source, /const resetCurrentSession = \(\{ clearFiles = false, cancelled = false \} = \{\}\) =>/u);
  assert.match(source, /state\.runId \+= 1/u);
  assert.match(source, /if \(runId !== state\.runId\) return;/u);
  assert.match(source, /v4-clear'\)\.addEventListener\('click', \(\) => resetCurrentSession\(\{ clearFiles: true \}\)\)/u);
  assert.match(source, /v4-cancel'\)\.addEventListener\('click', \(\) => resetCurrentSession\(\{ cancelled: state\.scanStatus === 'scanning' \}\)\)/u);
  const resetBody = source.slice(source.indexOf('const resetCurrentSession'), source.indexOf("byId('v4-file-input').addEventListener"));
  assert.doesNotMatch(resetBody, /clearV4Reports|removeV4Report/u);
});

test('existing proof and connected wallet UI are provider-backed and stale state is cleared', () => {
  const source = fs.readFileSync(new URL('../../../apps/web/v4/ui.js', import.meta.url), 'utf8');
  assert.match(source, /reconcileVerifiedProofPublication\(\{ provider: state\.proof\.provider, transactionHash: identity\.transactionHash/u);
  assert.match(source, /state\.proof\.receipt = null; state\.proof\.identityVerified = false/u);
  assert.match(source, /deriveProofWalletUiState/u);
  assert.match(source, /state\.proof\.wallet\.connected && state\.proof\.wallet\.chainId === state\.proof\.envelope\.chainId\) return/u);
  assert.match(source, /completionState = 'existing-proof-verified'/u);
  assert.match(source, /'new-transaction-reconciled'/u);
  assert.match(source, /Already published/u);
  assert.match(source, /No new transaction required/u);
});
