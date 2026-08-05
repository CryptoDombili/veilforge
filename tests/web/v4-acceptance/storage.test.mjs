import test from 'node:test';
import assert from 'node:assert/strict';
import { report } from '../../v4/report/helpers.mjs';
import { clearV4Reports, listV4Reports, loadV4Report, removeV4Report, saveV4Report, V3_STORAGE_PREFIX, V4_STORAGE_PREFIX } from '../../../apps/web/v4/persistence.js';
import { verifyV4Report } from '../../../apps/web/v4/report-adapter.js';
import { memoryStorage } from '../v4/helpers.mjs';

test('same project replaces its verified envelope and remains integrity checked', async () => {
  const storage = memoryStorage(); const verification = await verifyV4Report(report());
  await saveV4Report(storage, verification, { now: () => new Date('2026-08-05T00:00:00Z') });
  await saveV4Report(storage, verification, { now: () => new Date('2026-08-05T01:00:00Z') });
  const history = await listV4Reports(storage);
  assert.equal(history.entries.length, 1); assert.equal(history.entries[0].createdAt, '2026-08-05T01:00:00.000Z');
  assert.equal((await loadV4Report(storage, 'project-1')).verification.reportHash, verification.reportHash);
});

test('single delete and clear are strictly scoped to V4 namespace', async () => {
  const v3Key = `${V3_STORAGE_PREFIX}scan-history`; const storage = memoryStorage({ [v3Key]: '[{"id":"legacy"}]', [`${V4_STORAGE_PREFIX}bad`]: '{bad' });
  const verification = await verifyV4Report(report()); await saveV4Report(storage, verification);
  removeV4Report(storage, 'project-1'); assert.equal(storage.getItem(v3Key), '[{"id":"legacy"}]');
  assert.equal(clearV4Reports(storage), 1); assert.equal(storage.getItem(v3Key), '[{"id":"legacy"}]'); assert.equal(storage.length, 1);
});

test('storage-disabled and quota-like failures are controlled', async () => {
  const disabled = { get length() { throw new DOMException('disabled', 'SecurityError'); } };
  const listed = await listV4Reports(disabled); assert.equal(listed.errors[0].code, 'WEB_V4_STORAGE_QUOTA');
  assert.throws(() => clearV4Reports(disabled), { code: 'WEB_V4_STORAGE_QUOTA' });
  assert.throws(() => removeV4Report({ removeItem() { throw new DOMException('disabled', 'SecurityError'); } }, 'project'), { code: 'WEB_V4_STORAGE_QUOTA' });
});
