import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collectDroppedBrowserFiles, mergeSupportedBrowserFiles } from '../apps/web/v4/folder-drop.js';
import { browserFilesToScanInput, sourcePathForBrowserFile } from '../apps/web/v4/input-adapter.js';
import { transitionV4Lifecycle, v4ErrorMessage } from '../apps/web/v4/ui.js';
import { compileProject } from '../packages/analyzer/src/v4/frontend/index.js';
import { VeilForgeV4BrowserRuntime } from './web/v4-runtime/helpers.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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

const fileEntry = (file) => ({ name: file.name, isFile: true, isDirectory: false, file(resolve) { resolve(file); } });
const transfer = (...entries) => ({
  items: entries.map((entry) => ({ kind: 'file', webkitGetAsEntry() { return entry; }, getAsFile() { return null; } })),
  files: [],
});

test('ordinary picker files with blank webkitRelativePath use their safe top-level names', () => {
  const a = browserFile('A.sol', undefined, { webkitRelativePath: '' });
  assert.equal(sourcePathForBrowserFile(a), 'A.sol');
  assert.deepEqual(mergeSupportedBrowserFiles([], [a]).map((file) => file.path), ['A.sol']);
});

test('browser source paths prefer webkitRelativePath, then relativePath, then name', () => {
  assert.equal(sourcePathForBrowserFile({ name: 'Name.sol', relativePath: 'relative/Case.sol', webkitRelativePath: 'folder/contracts/Case.sol' }), 'folder/contracts/Case.sol');
  assert.equal(sourcePathForBrowserFile({ name: 'Name.sol', relativePath: 'relative/Case.sol', webkitRelativePath: '' }), 'relative/Case.sol');
  assert.equal(sourcePathForBrowserFile({ name: 'Name.sol', relativePath: '', webkitRelativePath: '' }), 'Name.sol');
});

test('two ordinary picker files with blank webkitRelativePath are accepted together', () => {
  const selected = mergeSupportedBrowserFiles([], [
    browserFile('B.sol', undefined, { webkitRelativePath: '' }),
    browserFile('A.sol', undefined, { webkitRelativePath: '' }),
  ]);
  assert.deepEqual(selected.map((file) => file.path), ['A.sol', 'B.sol']);
});

test('non-standard local file.path never overrides the safe browser filename fallback', () => {
  const selected = mergeSupportedBrowserFiles([], [
    browserFile('PrivacyLeakDemo.sol', undefined, { webkitRelativePath: '', path: 'C:\\Users\\Example\\PrivacyLeakDemo.sol' }),
    browserFile('TreasuryDisclosureDemo.sol', undefined, { webkitRelativePath: '', path: 'C:\\Users\\Example\\TreasuryDisclosureDemo.sol' }),
  ]);
  assert.deepEqual(selected.map((file) => file.path), ['PrivacyLeakDemo.sol', 'TreasuryDisclosureDemo.sol']);
});

test('sequential picker selections are additive and deterministic', () => {
  const first = mergeSupportedBrowserFiles([], [browserFile('A.sol')]);
  const second = mergeSupportedBrowserFiles(first, [browserFile('B.sol')]);
  assert.deepEqual(second.map((file) => file.path), ['A.sol', 'B.sol']);
});

test('one picker action retains every selected Solidity file', () => {
  const selected = mergeSupportedBrowserFiles([], [browserFile('B.sol'), browserFile('A.sol')]);
  assert.deepEqual(selected.map((file) => file.path), ['A.sol', 'B.sol']);
});

test('selecting an exact path again replaces that entry without duplication', async () => {
  const first = mergeSupportedBrowserFiles([], [browserFile('A.sol', 'pragma solidity 0.8.24; contract First {}')]);
  const second = mergeSupportedBrowserFiles(first, [browserFile('A.sol', 'pragma solidity 0.8.24; contract Second {}')]);
  assert.equal(second.length, 1);
  assert.match(decoder.decode(await second[0].arrayBuffer()), /contract Second/u);
  const source = fs.readFileSync(new URL('../apps/web/v4/ui.js', import.meta.url), 'utf8');
  assert.match(source, /const acceptPickerFiles = \(event\) => \{ acceptFiles\(event\.target\.files\); event\.target\.value = ''; \};/u);
});

test('Clear still resets all selected files in the bounded UI session', () => {
  const source = fs.readFileSync(new URL('../apps/web/v4/ui.js', import.meta.url), 'utf8');
  const reset = source.slice(source.indexOf('const resetCurrentSession'), source.indexOf("byId('v4-file-input').addEventListener"));
  assert.match(reset, /if \(clearFiles\) \{ state\.files = \[\]; state\.bytes = 0; state\.inputError = null;/u);
});

test('folder picker preserves normalized project-relative paths for imports', () => {
  const files = mergeSupportedBrowserFiles([], [
    browserFile('project/contracts/Main.sol'),
    browserFile('project/contracts/lib/Helper.sol'),
  ]);
  assert.deepEqual(files.map((file) => file.path), ['contracts/Main.sol', 'contracts/lib/Helper.sol']);
});

test('dragging multiple Solidity files retains every file', async () => {
  const dropped = await collectDroppedBrowserFiles(transfer(fileEntry(browserFile('B.sol')), fileEntry(browserFile('A.sol'))));
  const files = mergeSupportedBrowserFiles([], dropped);
  assert.deepEqual(files.map((file) => file.path), ['A.sol', 'B.sol']);
});

test('case-folding path collisions and traversal fail closed', () => {
  const selected = mergeSupportedBrowserFiles([], [browserFile('A.sol')]);
  assert.throws(() => mergeSupportedBrowserFiles(selected, [browserFile('a.sol')]), (error) => error.code === 'WEB_V4_INPUT_INVALID' && error.safeDetails.reasonCode === 'PATH_COLLISION');
  assert.throws(() => mergeSupportedBrowserFiles(selected, [browserFile('../Escape.sol')]), { code: 'WEB_V4_INPUT_INVALID' });
  assert.deepEqual(selected.map((file) => file.path), ['A.sol']);
});

test('absolute paths fail closed with a sanitized diagnostic', () => {
  assert.throws(() => mergeSupportedBrowserFiles([], [browserFile('C:\\secret\\Case.sol')]), (error) => {
    assert.equal(error.code, 'WEB_V4_INPUT_INVALID');
    assert.deepEqual(error.safeDetails, { reasonCode: 'INVALID_PATH' });
    const message = v4ErrorMessage(error);
    assert.match(message, /Diagnostic: INVALID_PATH/u);
    assert.doesNotMatch(message, /secret|Case\.sol|C:\\/u);
    return true;
  });
});

test('unsupported and over-limit additions do not mutate an existing valid selection', () => {
  const selected = mergeSupportedBrowserFiles([], [browserFile('A.sol')]);
  assert.throws(() => mergeSupportedBrowserFiles(selected, [browserFile('README.md')]), (error) => error.code === 'WEB_V4_INPUT_INVALID' && error.safeDetails.reasonCode === 'UNSUPPORTED_FILE');
  assert.throws(() => mergeSupportedBrowserFiles(selected, [browserFile('Large.sol', 'x'.repeat(513 * 1024))]), (error) => error.code === 'WEB_V4_INPUT_LIMIT' && error.safeDetails.reasonCode === 'FILE_TOO_LARGE');
  assert.throws(() => mergeSupportedBrowserFiles(selected, [browserFile('B.sol')], { limits: { maxFileCount: 1 } }), { code: 'WEB_V4_INPUT_LIMIT' });
  assert.throws(() => mergeSupportedBrowserFiles([], [browserFile('A.sol', '12'), browserFile('B.sol', '34')], { limits: { maxProjectBytes: 3 } }), (error) => error.code === 'WEB_V4_INPUT_LIMIT' && error.safeDetails.reasonCode === 'PROJECT_TOO_LARGE');
  assert.deepEqual(selected.map((file) => file.path), ['A.sol']);
});

const fixtureRoot = new URL('./fixtures/v4-multi-file-project/', import.meta.url);
const helperSource = fs.readFileSync(new URL('contracts/Helper.sol', fixtureRoot), 'utf8');
const mainSource = fs.readFileSync(new URL('contracts/Main.sol', fixtureRoot), 'utf8');

async function twoFileInput() {
  const files = mergeSupportedBrowserFiles([], [
    browserFile('project/contracts/Main.sol', mainSource),
    browserFile('project/contracts/Helper.sol', helperSource),
  ]);
  return browserFilesToScanInput(files, { projectId: 'two-file-project', projectName: 'Two file project', domains: ['arc-payments'], compilerVersion: '0.8.24' });
}

test('normalized multi-file relative imports compile locally', async () => {
  const input = await twoFileInput();
  assert.deepEqual(Object.keys(input.sources), ['contracts/Helper.sol', 'contracts/Main.sol']);
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
  const files = mergeSupportedBrowserFiles([], [
    browserFile('PrivacyLeakDemo.sol', privacyLeakDemo, { webkitRelativePath: '', path: 'C:\\Users\\Example\\PrivacyLeakDemo.sol' }),
    browserFile('TreasuryDisclosureDemo.sol', treasuryDisclosureDemo, { webkitRelativePath: '', path: 'C:\\Users\\Example\\TreasuryDisclosureDemo.sol' }),
  ]);
  assert.deepEqual(files.map((file) => file.path), ['PrivacyLeakDemo.sol', 'TreasuryDisclosureDemo.sol']);
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

test('drag and drop failures use a neutral file-input title', () => {
  const source = fs.readFileSync(new URL('../apps/web/v4/ui.js', import.meta.url), 'utf8');
  assert.match(source, /setStatus\('File input blocked'/u);
  assert.doesNotMatch(source, /setStatus\('Folder drop blocked'/u);
});
