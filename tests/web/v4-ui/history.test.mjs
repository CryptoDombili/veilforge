import test from 'node:test';
import assert from 'node:assert/strict';
import { report } from '../../v4/report/helpers.mjs';
import { listV4Reports, readV3Storage, saveV4Report, V3_STORAGE_PREFIX, V4_STORAGE_PREFIX } from '../../../apps/web/v4/persistence.js';
import { verifyV4Report } from '../../../apps/web/v4/report-adapter.js';
import { memoryStorage } from '../v4/helpers.mjs';

test('verified V4 history is enumerated and integrity-checked', async () => {
  const storage = memoryStorage(); const verification = await verifyV4Report(report());
  await saveV4Report(storage, verification, { now: () => new Date('2026-08-05T12:00:00Z') });
  const history = await listV4Reports(storage);
  assert.equal(history.entries.length, 1); assert.equal(history.entries[0].reportHash, verification.reportHash); assert.deepEqual(history.errors, []);
});

test('corrupt V4 history is isolated and V3 stays read-only', async () => {
  const v3Key = `${V3_STORAGE_PREFIX}scan-history`; const badKey = `${V4_STORAGE_PREFIX}broken`;
  const storage = memoryStorage({ [v3Key]: '[{"id":"legacy"}]', [badKey]: '{bad' });
  const before = [...storage.writes]; const history = await listV4Reports(storage);
  assert.equal(history.entries.length, 0); assert.equal(history.errors.length, 1);
  assert.equal(readV3Storage(storage)[0].id, 'legacy'); assert.deepEqual(storage.writes, before);
});
