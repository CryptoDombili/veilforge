import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createZip } from '../apps/web/lib/zip.js';

function runNode(args) {
  return spawnSync(process.execPath, args, { encoding: 'utf8', cwd: process.cwd() });
}

function readStoredZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset) => view.getUint16(offset, true);
  const u32 = (offset) => view.getUint32(offset, true);
  const endOffset = bytes.length - 22;
  assert.equal(u32(endOffset), 0x06054b50, 'end-of-central-directory signature');
  const entryCount = u16(endOffset + 10);
  const centralSize = u32(endOffset + 12);
  let centralOffset = u32(endOffset + 16);
  assert.equal(centralOffset + centralSize, endOffset, 'central directory bounds');

  const decoder = new TextDecoder();
  const entries = [];
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(u32(centralOffset), 0x02014b50, 'central-directory signature');
    assert.equal(u16(centralOffset + 10), 0, 'stored ZIP compression method');
    const compressedSize = u32(centralOffset + 20);
    const uncompressedSize = u32(centralOffset + 24);
    const nameLength = u16(centralOffset + 28);
    const extraLength = u16(centralOffset + 30);
    const commentLength = u16(centralOffset + 32);
    const localOffset = u32(centralOffset + 42);
    const name = decoder.decode(bytes.slice(centralOffset + 46, centralOffset + 46 + nameLength));

    assert.equal(u32(localOffset), 0x04034b50, 'local-file signature');
    const localNameLength = u16(localOffset + 26);
    const localExtraLength = u16(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    assert.equal(compressedSize, uncompressedSize, 'stored entry length');
    entries.push({ name, data: decoder.decode(bytes.slice(dataOffset, dataOffset + uncompressedSize)) });
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

test('CLI emits a canonical JSON report for a multi-file directory', () => {
  const result = runNode(['packages/analyzer/cli.mjs', 'scan', 'examples/multi-contract', '--format', 'json']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.scannerVersion, '3.2.2');
  assert.equal(report.files.length, 2);
  assert.match(report.reportHash, /^0x[0-9a-f]{64}$/);
});

test('CLI writes policy output to the requested file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'veilforge-cli-'));
  const output = path.join(directory, 'policy.json');
  try {
    const result = runNode(['packages/analyzer/cli.mjs', 'scan', 'examples/vulnerable-payroll', '--format', 'policy', '--output', output]);
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(manifest.generator, 'VeilForge 3.2.2');
    assert.ok(manifest.policies.length > 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI privacy gate uses a distinct failure exit code', () => {
  const blocked = runNode(['packages/analyzer/cli.mjs', 'scan', 'examples/vulnerable-payroll', '--format', 'text', '--gate']);
  const ready = runNode(['packages/analyzer/cli.mjs', 'scan', 'examples/remediated-payroll', '--format', 'text', '--gate']);
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /Privacy Gate failed/);
  assert.equal(ready.status, 0, ready.stderr);
});

test('programmatic and custom-rule examples execute without hidden dependencies', () => {
  for (const script of ['examples/programmatic-scan.mjs', 'examples/custom-rule.mjs']) {
    const result = runNode([script]);
    assert.equal(result.status, 0, `${script}\n${result.stderr}`);
    assert.doesNotThrow(() => JSON.parse(result.stdout));
  }
});

test('remediation ZIP builder is deterministic and uses valid ZIP signatures', () => {
  const entries = [
    { name: 'report/report.json', data: '{"ok":true}\n' },
    { name: 'source/Payroll.sol', data: 'contract Payroll {}\n' },
  ];
  const first = createZip(entries);
  const second = createZip(entries);
  assert.deepEqual(first, second);
  assert.deepEqual([...first.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.deepEqual([...first.slice(-22, -18)], [0x50, 0x4b, 0x05, 0x06]);
  assert.deepEqual(readStoredZip(first), entries);
});
