import test from 'node:test';
import assert from 'node:assert/strict';
import { bindV4DropZone, collectDroppedBrowserFiles, selectSupportedBrowserFiles } from '../../../apps/web/v4/folder-drop.js';
import { browserFilesToScanInput } from '../../../apps/web/v4/input-adapter.js';

const encode = (value) => new TextEncoder().encode(value);
const source = (name, content = 'pragma solidity 0.8.24; contract Case {}', overrides = {}) => {
  const data = encode(content);
  let reads = 0;
  return {
    file: { name, size: data.byteLength, type: 'text/plain', async arrayBuffer() { reads += 1; return data.slice().buffer; }, ...overrides },
    reads: () => reads,
  };
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
const options = { projectId: 'folder-parity', projectName: 'Folder parity', domains: ['arc-payments'], compilerVersion: '0.8.24' };

test('single and multiple Solidity files are accepted from file drag/drop', async () => {
  const a = source('A.sol').file; const b = source('B.sol').file;
  assert.deepEqual((await collectDroppedBrowserFiles(transfer(fileEntry(a)))).map((file) => file.name), ['A.sol']);
  assert.deepEqual((await collectDroppedBrowserFiles(transfer(fileEntry(a), fileEntry(b)))).map((file) => file.name), ['A.sol', 'B.sol']);
});

test('folder and nested folder entries preserve safe project-relative paths', async () => {
  const a = source('A.sol').file; const b = source('B.sol').file;
  const project = directoryEntry('project', [fileEntry(a), directoryEntry('src', [fileEntry(b)])]);
  const files = await collectDroppedBrowserFiles(transfer(project));
  assert.deepEqual(files.map((file) => file.relativePath), ['project/A.sol', 'project/src/B.sol']);
});

test('folder picker and folder drag/drop converge on the same canonical imported project', async () => {
  const token = 'pragma solidity 0.8.24; interface IToken { function pay(uint256 amount) external; }';
  const router = 'pragma solidity 0.8.24; import {IToken} from "./interfaces/IToken.sol"; contract Router { function route(IToken token, uint256 amount) external { token.pay(amount); } }';
  const dropped = await collectDroppedBrowserFiles(transfer(directoryEntry('project', [
    fileEntry(source('Router.sol', router).file),
    directoryEntry('interfaces', [fileEntry(source('IToken.sol', token).file)]),
  ])));
  const picker = [source('Router.sol', router, { webkitRelativePath: 'project/Router.sol' }).file, source('IToken.sol', token, { webkitRelativePath: 'project/interfaces/IToken.sol' }).file];
  const [dropInput, pickerInput] = await Promise.all([browserFilesToScanInput(dropped, options), browserFilesToScanInput(picker, options)]);
  assert.deepEqual(dropInput, pickerInput);
  assert.deepEqual(Object.keys(dropInput.sources), ['Router.sol', 'interfaces/IToken.sol']);
});

test('unsupported files are filtered exactly like picker intake and empty folders fail closed', async () => {
  const project = directoryEntry('project', [fileEntry(source('Case.sol').file), fileEntry(source('README.md', '# project').file)]);
  const dropped = await collectDroppedBrowserFiles(transfer(project));
  assert.deepEqual(selectSupportedBrowserFiles(dropped).map((file) => file.name), ['Case.sol']);
  await assert.rejects(collectDroppedBrowserFiles(transfer(directoryEntry('empty', []))), { code: 'WEB_V4_INPUT_INVALID' });
});

test('folder drop enforces file-count and declared-size limits before payload reads', async () => {
  const entries = ['A.sol', 'B.sol', 'C.sol'].map((name) => fileEntry(source(name).file));
  await assert.rejects(collectDroppedBrowserFiles(transfer(directoryEntry('project', entries)), { limits: { maxFileCount: 2 } }), { code: 'WEB_V4_INPUT_LIMIT' });
  const oversized = source('Large.sol', 'x', { size: 65 });
  const dropped = await collectDroppedBrowserFiles(transfer(directoryEntry('project', [fileEntry(oversized.file)])));
  await assert.rejects(browserFilesToScanInput(dropped, { ...options, limits: { maxPerFileBytes: 64 } }), { code: 'WEB_V4_INPUT_LIMIT' });
  assert.equal(oversized.reads(), 0);
});

test('unsafe relative paths, string drops, unsupported entries, and unavailable directory traversal fail closed', async () => {
  await assert.rejects(collectDroppedBrowserFiles(transfer(directoryEntry('project', [fileEntry({ ...source('Case.sol').file, name: '..' })]))), { code: 'WEB_V4_INPUT_INVALID' });
  await assert.rejects(collectDroppedBrowserFiles({ items: [{ kind: 'string' }], files: [] }), { code: 'WEB_V4_INPUT_INVALID' });
  await assert.rejects(collectDroppedBrowserFiles(transfer({ name: 'device', isFile: false, isDirectory: false })), { code: 'WEB_V4_INPUT_INVALID' });
  await assert.rejects(collectDroppedBrowserFiles({ items: [{ kind: 'file', getAsFile() { return null; } }], files: [] }), { code: 'WEB_V4_DIRECTORY_DROP_UNSUPPORTED' });
});

test('File System Access directory handles are supported without bypassing canonical paths', async () => {
  const file = source('Case.sol').file;
  const handle = { name: 'project', kind: 'directory', async *entries() { yield ['src', { name: 'src', kind: 'directory', async *entries() { yield ['Case.sol', { name: 'Case.sol', kind: 'file', async getFile() { return file; } }]; } }]; } };
  const files = await collectDroppedBrowserFiles({ items: [{ kind: 'file', async getAsFileSystemHandle() { return handle; } }], files: [] });
  assert.equal(files[0].relativePath, 'project/src/Case.sol');
});

class FakeDropZone extends EventTarget {
  constructor() { super(); this.values = new Set(); this.classList = { add: (value) => this.values.add(value), remove: (value) => this.values.delete(value), contains: (value) => this.values.has(value) }; }
  contains(value) { return value === this; }
}
const dragEvent = (type, dataTransfer = null) => {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  return event;
};

test('drag active, leave/error cleanup, default navigation prevention, and repeated drops are bounded', async () => {
  const zone = new FakeDropZone(); const accepted = []; const errors = [];
  bindV4DropZone(zone, { onFiles(files) { accepted.push(files); }, onError(error) { errors.push(error); } });
  const over = dragEvent('dragover', { items: [], files: [], dropEffect: 'none' });
  zone.dispatchEvent(over); assert.equal(over.defaultPrevented, true); assert.equal(zone.classList.contains('dragging'), true);
  const leave = dragEvent('dragleave'); zone.dispatchEvent(leave); assert.equal(zone.classList.contains('dragging'), false);
  const valid = transfer(fileEntry(source('Case.sol').file));
  for (let index = 0; index < 2; index += 1) {
    const dropped = dragEvent('drop', valid); zone.dispatchEvent(dropped); assert.equal(dropped.defaultPrevented, true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(zone.classList.contains('dragging'), false);
  }
  const invalid = dragEvent('drop', { items: [{ kind: 'string' }], files: [] }); zone.dispatchEvent(invalid);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(accepted.length, 2); assert.equal(errors.length, 1); assert.equal(zone.classList.contains('dragging'), false);
});
