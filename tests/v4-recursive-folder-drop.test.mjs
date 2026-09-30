import test from 'node:test';
import assert from 'node:assert/strict';
import { bindV4DropZone, collectDroppedBrowserFiles, mergeSupportedBrowserFiles, selectSupportedBrowserFiles } from '../apps/web/v4/folder-drop.js';
import { browserFilesToScanInput } from '../apps/web/v4/input-adapter.js';
import { v4SourceDisplayPath } from '../apps/web/v4/ui.js';
import { compileProject } from '../packages/analyzer/src/v4/frontend/index.js';
import { VeilForgeV4BrowserRuntime } from './web/v4-runtime/helpers.mjs';

const encoder = new TextEncoder();
const source = (name, content = 'pragma solidity 0.8.24; contract Case {}', overrides = {}) => {
  const bytes = encoder.encode(content);
  return { name, size: bytes.byteLength, type: 'text/plain', async arrayBuffer() { return bytes.slice().buffer; }, ...overrides };
};
const fileEntry = (file) => ({ name: file.name, isFile: true, isDirectory: false, file(resolve) { resolve(file); } });
const directoryEntry = (name, children) => ({
  name, isFile: false, isDirectory: true,
  createReader() {
    let sent = false;
    return { readEntries(resolve) { if (sent) resolve([]); else { sent = true; resolve(children); } } };
  },
});
const transfer = (...entries) => ({ items: entries.map((entry) => ({ kind: 'file', webkitGetAsEntry() { return entry; }, getAsFile() { return null; } })), files: [] });
const options = { projectId: 'recursive-folder-test', projectName: 'Recursive folder test', domains: ['arc-payments', 'arc-treasury'], compilerVersion: '0.8.24' };

test('active drop collector keeps single, multiple, and sequential ordinary file drops', async () => {
  const a = source('A.sol'); const b = source('B.sol');
  assert.deepEqual(await collectDroppedBrowserFiles(transfer(fileEntry(a))), [a]);
  assert.deepEqual(await collectDroppedBrowserFiles(transfer(fileEntry(a), fileEntry(b))), [a, b]);
  const first = mergeSupportedBrowserFiles([], await collectDroppedBrowserFiles(transfer(fileEntry(a))));
  const second = mergeSupportedBrowserFiles(first, await collectDroppedBrowserFiles(transfer(fileEntry(b))));
  assert.deepEqual(second.map((file) => file.name), ['A.sol', 'B.sol']);
  assert.deepEqual(selectSupportedBrowserFiles([a, b]), [a, b]);
});

test('recursive folder collection ignores unrelated files and retains nested import paths', async () => {
  const main = source('Main.sol', 'pragma solidity 0.8.24; import {Helper} from "./lib/Helper.sol"; contract Main { function answer() external pure returns (uint256) { return Helper.answer(); } }');
  const helper = source('Helper.sol', 'pragma solidity 0.8.24; library Helper { function answer() internal pure returns (uint256) { return 42; } }');
  const dropped = await collectDroppedBrowserFiles(transfer(directoryEntry('MyProject', [
    directoryEntry('contracts', [fileEntry(main), directoryEntry('lib', [fileEntry(helper)])]),
    directoryEntry('scripts', [fileEntry(source('deploy.js', 'ignored'))]),
    fileEntry(source('README.md', '# ignored')),
    fileEntry(source('package.json', '{}')),
  ])));
  assert.deepEqual(dropped.map((file) => file.relativePath), ['MyProject/contracts/Main.sol', 'MyProject/contracts/lib/Helper.sol']);
  assert.deepEqual(dropped.map(v4SourceDisplayPath), ['MyProject/contracts/Main.sol', 'MyProject/contracts/lib/Helper.sol']);
  const input = await browserFilesToScanInput(dropped, options);
  assert.deepEqual(Object.keys(input.sources), ['contracts/Main.sol', 'contracts/lib/Helper.sol']);
  assert.equal(compileProject({ sources: input.sources, settings: input.settings, resolverSources: input.resolverSources }).result.status, 'compiled');
  const picker = [source('Main.sol', await awaitText(main), { webkitRelativePath: 'MyProject/contracts/Main.sol' }), source('Helper.sol', await awaitText(helper), { webkitRelativePath: 'MyProject/contracts/lib/Helper.sol' })];
  const pickerInput = await browserFilesToScanInput(picker, options);
  assert.deepEqual(pickerInput.sources, input.sources);
});

test('.sol-named directory identity wins over suffix and zero-byte pseudo-file', async () => {
  const a = source('PrivacyLeakDemo.sol'); const b = source('TreasuryDisclosureDemo.sol');
  const directory = { ...directoryEntry('m.sol', [fileEntry(a), fileEntry(b)]), isFile: true };
  const dropped = await collectDroppedBrowserFiles({ ...transfer(directory), files: [{ name: 'm.sol', size: 0, type: '' }] });
  assert.deepEqual(dropped.map((file) => file.relativePath), ['m.sol/PrivacyLeakDemo.sol', 'm.sol/TreasuryDisclosureDemo.sol']);
  assert.deepEqual(dropped.map(v4SourceDisplayPath), ['m.sol/PrivacyLeakDemo.sol', 'm.sol/TreasuryDisclosureDemo.sol']);
  assert.equal(dropped.length, 2);
  await assert.rejects(collectDroppedBrowserFiles({ items: [], files: [{ name: 'm.sol', size: 0, type: '' }] }), { code: 'WEB_V4_DIRECTORY_DROP_UNSUPPORTED' });
  const one = await collectDroppedBrowserFiles(transfer(directoryEntry('m.sol', [fileEntry(a)])));
  assert.deepEqual(one.map((file) => file.relativePath), ['m.sol/PrivacyLeakDemo.sol']);
});

test('File System Access handles recurse through .sol-named directories', async () => {
  const file = source('A.sol');
  const handle = { name: 'm.sol', kind: 'directory', async *entries() { yield ['nested', { kind: 'directory', async *entries() { yield ['A.sol', { kind: 'file', async getFile() { return file; } }]; } }]; } };
  const dropped = await collectDroppedBrowserFiles({ items: [{ kind: 'file', async getAsFileSystemHandle() { return handle; } }], files: [] });
  assert.deepEqual(dropped.map((entry) => entry.relativePath), ['m.sol/nested/A.sol']);
});

test('recursive collection and adapter fail closed on count, bytes, aliases, traversal, and collisions', async () => {
  const many = Array.from({ length: 300 }, (_, index) => fileEntry(source(`Source${index}.sol`)));
  await assert.rejects(collectDroppedBrowserFiles(transfer(directoryEntry('project', many))), { code: 'WEB_V4_INPUT_LIMIT' });
  await assert.rejects(collectDroppedBrowserFiles(transfer(directoryEntry('project', [fileEntry(source('Alias.sol', undefined, { symlink: true }))]))), { code: 'WEB_V4_INPUT_INVALID' });
  await assert.rejects(collectDroppedBrowserFiles(transfer(directoryEntry('..', [fileEntry(source('A.sol'))]))), { code: 'WEB_V4_INPUT_INVALID' });
  const collision = await collectDroppedBrowserFiles(transfer(directoryEntry('project', [fileEntry(source('A.sol')), fileEntry(source('a.sol'))])));
  await assert.rejects(browserFilesToScanInput(collision, options), { code: 'WEB_V4_INPUT_INVALID' });
  const large = source('Large.sol', 'x', { size: 512 * 1024 + 1 });
  await assert.rejects(browserFilesToScanInput(await collectDroppedBrowserFiles(transfer(directoryEntry('project', [fileEntry(large)]))), options), { code: 'WEB_V4_INPUT_LIMIT' });
  const total = [source('A.sol', 'x'.repeat(512 * 1024)), source('B.sol', 'x'.repeat(512 * 1024)), source('C.sol', 'x')];
  await assert.rejects(browserFilesToScanInput(await collectDroppedBrowserFiles(transfer(directoryEntry('project', total.map(fileEntry)))), options), { code: 'WEB_V4_INPUT_LIMIT' });
});

test('active drop-zone binding accepts a recursive folder without accepting its directory as a file', async () => {
  const zone = new EventTarget();
  zone.classList = { add() {}, remove() {} };
  const accepted = []; const errors = [];
  bindV4DropZone(zone, { onFiles(files) { accepted.push(files); }, onError(error) { errors.push(error); } });
  const folder = directoryEntry('m.sol', [fileEntry(source('A.sol'))]);
  const event = new Event('drop', { cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: transfer(folder) });
  zone.dispatchEvent(event);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(event.defaultPrevented, true);
  assert.equal(errors.length, 0);
  assert.deepEqual(accepted[0].map((file) => file.relativePath), ['m.sol/A.sol']);
});

test('nested folder project compiles and yields a verified V4 scan with findings', async () => {
  const leak = source('PrivacyLeakDemo.sol', 'pragma solidity 0.8.24; contract PrivacyLeakDemo { bytes32 public payerReference; constructor(bytes32 value) { payerReference = value; } }');
  const helper = source('Helper.sol', 'pragma solidity 0.8.24; library Helper { function keep(bytes32 value) internal pure returns (bytes32) { return value; } }');
  const main = source('Main.sol', 'pragma solidity 0.8.24; import {Helper} from "./lib/Helper.sol"; contract Main { function keep(bytes32 value) external pure returns (bytes32) { return Helper.keep(value); } }');
  const dropped = await collectDroppedBrowserFiles(transfer(directoryEntry('TestProject', [
    fileEntry(leak), directoryEntry('nested', [fileEntry(main), directoryEntry('lib', [fileEntry(helper)])]),
  ])));
  const input = await browserFilesToScanInput(dropped, options);
  assert.equal(compileProject({ sources: input.sources, settings: input.settings, resolverSources: input.resolverSources }).result.status, 'compiled');
  const result = await VeilForgeV4BrowserRuntime.scanProject(input);
  assert.equal(result.status, 'completed');
  assert.equal(result.verification.verified, true);
  assert.equal(result.report.integrity.verified, true);
  assert.ok(result.report.findings.length > 0);
});

async function awaitText(file) { return new TextDecoder().decode(await file.arrayBuffer()); }
