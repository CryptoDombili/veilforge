import test from 'node:test';
import assert from 'node:assert/strict';
import { createScanSession, runScanStage, runRemainingStages, scanProject } from 'veilforge';
import { tinyInput } from './helpers.mjs';

test('staged scan equals one-call scan', async () => {
  const input = tinyInput();
  const direct = await scanProject(input);
  let session = createScanSession(input);
  session = await runScanStage(session, 'input-validation');
  assert.deepEqual(session.completedStages, ['input-validation']);
  const staged = await runRemainingStages(session);
  assert.deepEqual(staged, direct);
});
test('caller cannot violate stage order', async () => {
  const session = createScanSession(tinyInput());
  await assert.rejects(() => runScanStage(session, 'compilation'), { code: 'SDK_SCAN_FAILED' });
});
