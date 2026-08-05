import test from 'node:test';
import assert from 'node:assert/strict';
import { scanProject } from 'veilforge';
import { tinyInput } from './helpers.mjs';

test('progress is ordered and payload is safe', async () => {
  const events = [];
  await scanProject(tinyInput(), { onProgress: (event) => events.push(event) });
  assert.equal(events[0].event, 'scan-started'); assert.equal(events.at(-1).event, 'scan-completed');
  for (const event of events) {
    assert.deepEqual(Object.keys(event), ['event', 'stage', 'status', 'completedStageCount', 'totalStageCount', 'message', 'progress']);
    assert.equal(JSON.stringify(event).includes('pragma solidity'), false);
  }
});
test('callback errors are ignored by default', async () => {
  const result = await scanProject(tinyInput(), { onProgress: () => { throw new Error('callback-private'); } });
  assert.equal(result.ok, true);
});
test('callback errors can fail with the SDK callback code', async () => {
  await assert.rejects(() => scanProject(tinyInput(), { onProgress: () => { throw new Error('callback-private'); }, progressCallbackErrorMode: 'fail' }), { code: 'SDK_PROGRESS_CALLBACK_FAILED' });
});
