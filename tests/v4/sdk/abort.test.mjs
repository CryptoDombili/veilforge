import test from 'node:test';
import assert from 'node:assert/strict';
import { scanProject, createScanSession, abortScan, runRemainingStages } from 'veilforge';
import { tinyInput } from './helpers.mjs';

test('pre-aborted signal yields structured abort and partial result', async () => {
  const controller = new AbortController(); controller.abort('private reason');
  await assert.rejects(() => scanProject(tinyInput(), { signal: controller.signal }), (error) => error.code === 'SDK_SCAN_ABORTED' && Boolean(error.partialResult));
});
test('public abort snapshot is frozen and remaining stages return aborted status', async () => {
  const session = createScanSession(tinyInput(), { throwOnError: false });
  const aborted = abortScan(session, 'stop');
  assert.equal(aborted.aborted, true); assert.equal(Object.isFrozen(aborted), true);
  const result = await runRemainingStages(aborted); assert.equal(result.status, 'aborted');
});
