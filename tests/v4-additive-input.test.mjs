import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectSupportedBrowserFiles } from '../apps/web/v4/folder-drop.js';
import { browserFilesToScanInput } from '../apps/web/v4/input-adapter.js';
import { transitionV4Lifecycle } from '../apps/web/v4/ui.js';
import { compileProject } from '../packages/analyzer/src/v4/frontend/index.js';
import { VeilForgeV4BrowserRuntime } from './web/v4-runtime/helpers.mjs';

const encoder = new TextEncoder();

function browserFile(path, content = 'pragma solidity 0.8.24; contract Case {}', overrides = {}) {
  const data = encoder.encode(content);
  const file = {
    name: path.split('/').at(-1),
    size: data.byteLength,
    type: 'text/plain',
    async arrayBuffer() { return data.slice().buffer; },
    ...overrides,
  };
  if (path.includes('/')) file.webkitRelativePath = path;
  return file;
}

test('one ordinary top-level picker file remains a raw browser File input', async () => {
  const file = browserFile('TreasuryDisclosureDemo.sol', undefined, { webkitRelativePath: '', path: 'C:\\Users\\Example\\TreasuryDisclosureDemo.sol' });
  const selected = selectSupportedBrowserFiles([file]);
  assert.equal(selected[0], file);
  const input = await browserFilesToScanInput(selected, { projectId: 'single-file', projectName: 'Single file', domains: ['arc-treasury'], compilerVersion: '0.8.24' });
  assert.deepEqual(Object.keys(input.sources), ['TreasuryDisclosureDemo.sol']);
});

test('one picker action retains both raw top-level Solidity files', async () => {
  const files = [browserFile('PrivacyLeakDemo.sol', undefined, { webkitRelativePath: '' }), browserFile('TreasuryDisclosureDemo.sol', undefined, { webkitRelativePath: '' })];
  const selected = selectSupportedBrowserFiles(files);
  assert.equal(selected[0], files[0]);
  assert.equal(selected[1], files[1]);
  const input = await browserFilesToScanInput(selected, { projectId: 'two-files', projectName: 'Two files', domains: ['arc-payments', 'arc-treasury'], compilerVersion: '0.8.24' });
  assert.deepEqual(Object.keys(input.sources), ['PrivacyLeakDemo.sol', 'TreasuryDisclosureDemo.sol']);
});

test('UI picker selection remains unchanged while file drops use the validated merge path', () => {
  const source = fs.readFileSync(new URL('../apps/web/v4/ui.js', import.meta.url), 'utf8');
  const intake = source.slice(source.indexOf('const acceptFiles'), source.indexOf('const runScan'));
  assert.match(source, /bindV4DropZone, mergeSupportedBrowserFiles, selectSupportedBrowserFiles/u);
  assert.match(intake, /merge \? mergeSupportedBrowserFiles\(state\.files, files\) : selectSupportedBrowserFiles\(files\)/u);
  assert.match(intake, /state\.files = selected/u);
  assert.match(source, /const acceptPickerFiles = \(event\) => \{ acceptFiles\(event\.target\.files\)/u);
  assert.match(source, /onFiles\(files\) \{ return acceptFiles\(files, \{ merge: true \}\); \}/u);
});

const fixtureRoot = new URL('./fixtures/v4-multi-file-project/', import.meta.url);
const helperSource = fs.readFileSync(new URL('contracts/Helper.sol', fixtureRoot), 'utf8');
const mainSource = fs.readFileSync(new URL('contracts/Main.sol', fixtureRoot), 'utf8');

async function twoFileInput() {
  const files = selectSupportedBrowserFiles([browserFile('Main.sol', mainSource), browserFile('Helper.sol', helperSource)]);
  return browserFilesToScanInput(files, { projectId: 'two-file-project', projectName: 'Two file project', domains: ['arc-payments'], compilerVersion: '0.8.24' });
}

test('normalized multi-file relative imports compile locally', async () => {
  const input = await twoFileInput();
  assert.deepEqual(Object.keys(input.sources), ['Helper.sol', 'Main.sol']);
  assert.equal(compileProject({ sources: input.sources, settings: input.settings, resolverSources: input.resolverSources }).result.status, 'compiled');
});

test('two-file Solidity project produces a cryptographically verified V4 report', async () => {
  const result = await VeilForgeV4BrowserRuntime.scanProject(await twoFileInput());
  assert.equal(result.status, 'completed');
  assert.equal(result.verification.verified, true);
  assert.equal(result.report.integrity.verified, true);
  assert.match(result.report.integrity.reportHash, /^sha256:[a-f0-9]{64}$/u);
});

test('the reported Windows picker pair is accepted and produces verified findings', async () => {
  const privacyLeakDemo = '// SPDX-License-Identifier: MIT\npragma solidity 0.8.24; contract PrivacyLeakDemo { bytes32 public payerReference; constructor(bytes32 value) { payerReference = value; } }';
  const treasuryDisclosureDemo = '// SPDX-License-Identifier: MIT\npragma solidity 0.8.24; contract TreasuryDisclosureDemo { bytes32 public treasuryOperatorReference; constructor(bytes32 value) { treasuryOperatorReference = value; } }';
  const files = selectSupportedBrowserFiles([
    browserFile('PrivacyLeakDemo.sol', privacyLeakDemo, { webkitRelativePath: '', path: 'C:\\Users\\Example\\PrivacyLeakDemo.sol' }),
    browserFile('TreasuryDisclosureDemo.sol', treasuryDisclosureDemo, { webkitRelativePath: '', path: 'C:\\Users\\Example\\TreasuryDisclosureDemo.sol' }),
  ]);
  assert.deepEqual(files.map((file) => file.name), ['PrivacyLeakDemo.sol', 'TreasuryDisclosureDemo.sol']);
  const input = await browserFilesToScanInput(files, { projectId: 'reported-picker-pair', projectName: 'Reported picker pair', domains: ['arc-payments', 'arc-treasury'], compilerVersion: '0.8.24' });
  const result = await VeilForgeV4BrowserRuntime.scanProject(input);
  assert.equal(result.status, 'completed');
  assert.equal(result.verification.verified, true);
  assert.equal(result.report.integrity.verified, true);
  assert.ok(result.report.findings.length > 0);
});

test('changing files invalidates only the current verified result and leaves history state untouched', () => {
  const historySentinel = Object.freeze([{ reportHash: `sha256:${'b'.repeat(64)}` }]);
  const state = {
    verification: { verified: true },
    viewModel: { reportHash: `sha256:${'a'.repeat(64)}` },
    exportBundle: {},
    scanStatus: 'verified',
    sessionReset: false,
    restoredReport: true,
    reviewReady: true,
    verifyReady: true,
    reviewedFinding: true,
    exported: true,
    historyFailure: { code: 'old' },
    historyEntries: historySentinel,
    analysis: { state: 'verified' },
    proof: { envelope: {}, provider: null, status: 'ready' },
  };
  transitionV4Lifecycle(state, 'files-changed', { analysis: { state: 'ready', phase: null, message: 'Project files changed.' } });
  assert.equal(state.verification, null);
  assert.equal(state.viewModel, null);
  assert.equal(state.exportBundle, null);
  assert.equal(state.scanStatus, 'idle');
  assert.equal(state.reviewReady, false);
  assert.equal(state.verifyReady, false);
  assert.equal(state.proof.envelope, null);
  assert.equal(state.historyEntries, historySentinel);
  const source = fs.readFileSync(new URL('../apps/web/v4/ui.js', import.meta.url), 'utf8');
  assert.match(source, /transitionV4Lifecycle\(state, 'files-changed'/u);
  assert.match(source, /clearRenderedReport\(\)/u);
  assert.doesNotMatch(source.slice(source.indexOf('const invalidateCurrentReportForFileChange'), source.indexOf('const acceptFiles')), /clearV4Reports|removeV4Report/u);
});

test('upload surface advertises file drops and retains explicit Files and Folder pickers', () => {
  const source = fs.readFileSync(new URL('../apps/web/v4/ui.js', import.meta.url), 'utf8');
  assert.match(source, /Drop Solidity files here, or choose Files \/ Folder/u);
  assert.match(source, /id="v4-file-input" type="file" accept="\.sol,\.txt" multiple hidden/u);
  assert.match(source, /id="v4-folder-input" type="file" accept="\.sol,\.txt" webkitdirectory directory multiple hidden/u);
  assert.match(source, /bindV4DropZone\(byId\('v4-drop-zone'\)/u);
  assert.match(source, /Folder drag-and-drop is not supported\. Use the Folder button\./u);
});
