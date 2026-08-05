import test from 'node:test';
import assert from 'node:assert/strict';
import { scanProject, createScanSession, runRemainingStages } from 'veilforge';
import { tinyInput } from './helpers.mjs';

test('input is not mutated and result/session views are isolated and frozen', async () => {
  const input = tinyInput(); const before = structuredClone(input);
  const session = createScanSession(input); assert.equal(Object.isFrozen(session), true); assert.equal(Object.isFrozen(session.stageResults), true);
  const result = await runRemainingStages(session);
  assert.deepEqual(input, before); assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.report), true);
  const bytes = result.exportPackage.files[0].bytes; bytes[0] ^= 1;
  const fresh = await scanProject(input); assert.equal(fresh.exportVerification.verified, true);
});
