import test from 'node:test';
import assert from 'node:assert/strict';
import { scanProject } from 'veilforge';
import { tinyInput } from './helpers.mjs';

test('stage timeout is a structured SDK timeout with partial result', async () => {
  await assert.rejects(() => scanProject(tinyInput(), { stageTimeoutMs: 1 }), (error) => error.code === 'SDK_SCAN_TIMEOUT' && error.partialResult?.stageSummary?.length === 14);
});
test('global timeout can return a timed-out result', async () => {
  const result = await scanProject(tinyInput(), { globalTimeoutMs: 1, throwOnError: false });
  assert.equal(result.status, 'timed-out'); assert.equal(result.ok, false);
});
