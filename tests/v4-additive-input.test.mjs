import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collectDroppedBrowserFiles, mergeSupportedBrowserFiles } from '../apps/web/v4/folder-drop.js';
import { browserFilesToScanInput } from '../apps/web/v4/input-adapter.js';
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
  assert.throws(() => mergeSupportedBrowserFiles(selected, [browserFile('a.sol')]), { code: 'WEB_V4_INPUT_INVALID' });
  assert.throws(() => mergeSupportedBrowserFiles(selected, [browserFile('../Escape.sol')]), { code: 'WEB_V4_INPUT_INVALID' });
  assert.deepEqual(selected.map((file) => file.path), ['A.sol']);
});

test('unsupported and over-limit additions do not mutate an existing valid selection', () => {
  const selected = mergeSupportedBrowserFiles([], [browserFile('A.sol')]);
  assert.throws(() => mergeSupportedBrowserFiles(selected, [browserFile('README.md')]), { code: 'WEB_V4_INPUT_INVALID' });
  assert.throws(() => mergeSupportedBrowserFiles(selected, [browserFile('Large.sol', 'x'.repeat(513 * 1024))]), { code: 'WEB_V4_INPUT_LIMIT' });
  assert.throws(() => mergeSupportedBrowserFiles(selected, [browserFile('B.sol')], { limits: { maxFileCount: 1 } }), { code: 'WEB_V4_INPUT_LIMIT' });
  assert.throws(() => mergeSupportedBrowserFiles([], [browserFile('A.sol', '12'), browserFile('B.sol', '34')], { limits: { maxProjectBytes: 3 } }), { code: 'WEB_V4_INPUT_LIMIT' });
  assert.deepEqual(selected.map((file) => file.path), ['A.sol']);
});

const helperSource = 'pragma solidity 0.8.24; library Helper { function normalize(uint256 value) internal pure returns (uint256) { return value; } }';
const mainSource = 'pragma solidity 0.8.24; import {Helper} from "./lib/Helper.sol"; contract Main { uint256 public paymentAmount; function store(uint256 value) external { paymentAmount = Helper.normalize(value); } }';

async function twoFileInput() {
  const files = mergeSupportedBrowserFiles([], [
    browserFile('project/contracts/Main.sol', mainSource),
    browserFile('project/contracts/lib/Helper.sol', helperSource),
  ]);
  return browserFilesToScanInput(files, { projectId: 'two-file-project', projectName: 'Two file project', domains: ['arc-payments'], compilerVersion: '0.8.24' });
}

test('normalized multi-file relative imports compile locally', async () => {
  const input = await twoFileInput();
  assert.deepEqual(Object.keys(input.sources), ['contracts/Main.sol', 'contracts/lib/Helper.sol']);
  assert.equal(compileProject({ sources: input.sources, settings: input.settings, resolverSources: input.resolverSources }).result.status, 'compiled');
});

test('two-file Solidity project produces a cryptographically verified V4 report', async () => {
  const result = await VeilForgeV4BrowserRuntime.scanProject(await twoFileInput());
  assert.equal(result.status, 'completed');
  assert.equal(result.verification.verified, true);
  assert.equal(result.report.integrity.verified, true);
  assert.match(result.report.integrity.reportHash, /^sha256:[a-f0-9]{64}$/u);
});
