import test from 'node:test';
import assert from 'node:assert/strict';
import { report } from '../../v4/report/helpers.mjs';
import { loadV4Report, readV3Storage, saveV4Report, V3_STORAGE_PREFIX, V4_STORAGE_PREFIX } from '../../../apps/web/v4/persistence.js';
import { verifyV4Report } from '../../../apps/web/v4/report-adapter.js';
import { createV4ViewModel } from '../../../apps/web/v4/view-models.js';
import { memoryStorage } from './helpers.mjs';

test('verified V4 report saves and loads in separate namespace', async () => {
  const storage = memoryStorage(); const verification = await verifyV4Report(report());
  await saveV4Report(storage, verification, { viewModel: createV4ViewModel(verification), now: () => new Date('2026-08-05T00:00:00Z') });
  assert.ok(storage.writes[0].startsWith(V4_STORAGE_PREFIX));
  assert.equal((await loadV4Report(storage, verification.report.project.projectId)).verification.reportHash, verification.reportHash);
});
test('V3 persistence is read-only', () => {
  const key = `${V3_STORAGE_PREFIX}scan-history`; const storage = memoryStorage({ [key]: '[{"id":"v3"}]' });
  assert.equal(readV3Storage(storage)[0].id, 'v3');
  assert.deepEqual(storage.writes, []);
});
test('corrupt and unknown envelopes are rejected', async () => {
  const projectId = 'project-1'; const key = `${V4_STORAGE_PREFIX}${encodeURIComponent(projectId)}`;
  await assert.rejects(loadV4Report(memoryStorage({ [key]: '{' }), projectId), { code: 'WEB_V4_PERSISTENCE_INVALID' });
  await assert.rejects(loadV4Report(memoryStorage({ [key]: JSON.stringify({ envelopeVersion: 'unknown' }) }), projectId), { code: 'WEB_V4_PERSISTENCE_INVALID' });
});
test('persistence size limit and storage quota errors are controlled', async () => {
  const verification = await verifyV4Report(report());
  await assert.rejects(saveV4Report(memoryStorage(), verification, { limits: { maxPersistenceBytes: 10 } }), { code: 'WEB_V4_PERSISTENCE_LIMIT' });
  const storage = { setItem() { throw new Error('quota with secret'); } };
  await assert.rejects(saveV4Report(storage, verification), { code: 'WEB_V4_STORAGE_QUOTA' });
});
test('unverified and V3 reports cannot be persisted as V4', async () => {
  await assert.rejects(saveV4Report(memoryStorage(), { verified: false, report: { schemaVersion: '3.2' } }), { code: 'WEB_V4_REPORT_UNVERIFIED' });
});
