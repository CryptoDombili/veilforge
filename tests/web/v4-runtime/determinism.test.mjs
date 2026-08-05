import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildWebV4Runtime } from '../../../scripts/build-web-v4-runtime.mjs';
import { browserScan } from './helpers.mjs';

test('repeated runtime builds are byte deterministic', () => {
  const first = fs.readFileSync('dist/v4/veilforge-v4-scanner.worker.manifest.json');
  buildWebV4Runtime();
  const second = fs.readFileSync('dist/v4/veilforge-v4-scanner.worker.manifest.json');
  assert.deepEqual(second, first);
});
test('repeated scans are canonical byte deterministic', async () => {
  const left = await browserScan('PAY-POS-001'); const right = await browserScan('PAY-POS-001');
  assert.equal(left.reportHash, right.reportHash); assert.deepEqual(left.report, right.report);
});
test('LF/CRLF/BOM, path separators, and insertion order preserve hash', async () => {
  const base = { projectId: 'normalization', compiler: { version: '0.8.24' }, domains: ['arc-payments'] };
  const source = 'pragma solidity 0.8.24;\ncontract Normalized { uint256 public value; }\n';
  const runtime = globalThis.VeilForgeV4BrowserRuntime;
  const left = await runtime.scanProject({ ...base, sources: { 'src/Case.sol': { content: source } }, settings: { optimizer: { enabled: false, runs: 200 } } });
  const right = await runtime.scanProject({ settings: { optimizer: { runs: 200, enabled: false } }, sources: { 'src\\Case.sol': { content: `\ufeff${source.replaceAll('\n', '\r\n')}` } }, ...base });
  assert.equal(left.reportHash, right.reportHash);
});
