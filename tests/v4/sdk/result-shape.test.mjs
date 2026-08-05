import test from 'node:test';
import assert from 'node:assert/strict';
import { scanProject } from 'veilforge';
import { tinyInput } from './helpers.mjs';

test('public result has stable fields without compiler output, AST, or source', async () => {
  const input = tinyInput(); const result = await scanProject(input);
  for (const key of ['ok', 'status', 'scanId', 'compilation', 'analysis', 'classification', 'detectorRun', 'findingRun', 'presentation', 'report', 'reportIntegrity', 'markdown', 'exportPackage', 'exportVerification', 'incompleteReasons', 'stageSummary', 'warnings', 'errors']) assert.equal(key in result, true);
  assert.equal('output' in result.compilation, false); assert.equal('ast' in result.compilation, false);
  assert.equal(JSON.stringify(result.compilation).includes(input.sources['contracts/Tiny.sol'].content), false);
});
test('an incomplete scan preserves report and verified export', async () => {
  const result = await scanProject({ ...tinyInput(), budgets: { compilation: { maxItems: 0 } } });
  assert.equal(result.status, 'incomplete'); assert.ok(result.report); assert.ok(result.exportPackage);
  assert.ok(result.incompleteReasons.includes('stage-budget-exceeded:compilation')); assert.equal(result.ok, false);
});
