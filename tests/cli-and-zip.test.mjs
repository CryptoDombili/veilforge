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

test('CLI emits a canonical JSON report for a multi-file directory', () => {
  const result = runNode(['packages/analyzer/cli.mjs', 'scan', 'examples/multi-contract', '--format', 'json']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.scannerVersion, '1.8.0');
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
    assert.equal(manifest.generator, 'VeilForge 1.8.0');
    assert.ok(manifest.policies.length > 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'veilforge-zip-'));
  const archive = path.join(directory, 'remediation-pack.zip');
  try {
    fs.writeFileSync(archive, first);
    const checked = spawnSync('unzip', ['-t', archive], { encoding: 'utf8' });
    assert.equal(checked.status, 0, checked.stderr || checked.stdout);
    assert.match(checked.stdout, /No errors detected/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
