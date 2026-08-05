import test from 'node:test';
import assert from 'node:assert/strict';
import { runBenchmarkCase } from '../../../packages/benchmark/src/index.js';

test('declared case-folded source aliases remain an input-invalid corpus disposition', async () => {
  const result = await runBenchmarkCase('CRD-ADV-004');
  assert.equal(result.compileDisposition, 'input-invalid');
  assert.equal(result.analysisStatus, 'incomplete');
  assert.deepEqual(result.incompleteReasons, ['source-input-invalid']);
  assert.equal(result.passed, true);
});
