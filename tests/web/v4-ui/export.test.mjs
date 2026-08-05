import test from 'node:test';
import assert from 'node:assert/strict';
import { report } from '../../v4/report/helpers.mjs';
import { createV4WebExport, verifyV4WebExport } from '../../../apps/web/v4/export-adapter.js';
import { verifyV4Report } from '../../../apps/web/v4/report-adapter.js';
import { createV4ViewModel } from '../../../apps/web/v4/view-models.js';

test('UI export set contains only verified canonical report, Markdown and manifest', async () => {
  const verification = await verifyV4Report(report()); const view = createV4ViewModel(verification);
  const bundle = await createV4WebExport(verification, view); const checked = await verifyV4WebExport(bundle);
  assert.equal(checked.verified, true);
  assert.deepEqual(bundle.files.map((item) => item.filename), ['veilforge-report-v4.json', 'veilforge-report-v4.md', 'veilforge-web-export-manifest.json']);
  assert.equal(bundle.manifest.reportHash, verification.reportHash);
});

test('tampered export remains blocked', async () => {
  const verification = await verifyV4Report(report()); const bundle = structuredClone(await createV4WebExport(verification, createV4ViewModel(verification)));
  bundle.files[0].bytes[0] ^= 1;
  await assert.rejects(verifyV4WebExport(bundle), { code: 'WEB_V4_EXPORT_INVALID' });
});
