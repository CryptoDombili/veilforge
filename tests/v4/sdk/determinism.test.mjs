import test from 'node:test';
import assert from 'node:assert/strict';
import { scanProject } from 'veilforge';
import { tinyInput } from './helpers.mjs';

const stable = (result) => JSON.stringify(result);
test('repeated scans have the same deterministic public projection', async () => {
  const left = await scanProject(tinyInput()); const right = await scanProject(tinyInput());
  assert.equal(stable(left), stable(right));
});
test('object insertion order and normalized source forms do not affect output', async () => {
  const base = tinyInput(); const content = base.sources['contracts/Tiny.sol'].content;
  const left = await scanProject({ ...base, settings: { optimizer: { runs: 200, enabled: false } } });
  const right = await scanProject({ sources: { 'contracts\\Tiny.sol': { content: `\uFEFF${content.replaceAll('\n', '\r\n')}` } }, projectId: base.projectId, settings: { optimizer: { enabled: false, runs: 200 } } });
  assert.equal(left.report.integrity.reportHash, right.report.integrity.reportHash);
  assert.equal(left.markdown, right.markdown);
  assert.deepEqual(left.exportPackage.files.map((file) => file.bytes), right.exportPackage.files.map((file) => file.bytes));
  assert.deepEqual(left.stageSummary, right.stageSummary);
});
