import test from 'node:test';
import assert from 'node:assert/strict';
import { report } from '../../v4/report/helpers.mjs';
import { createV4WebExport, verifyV4WebExport } from '../../../apps/web/v4/export-adapter.js';
import { verifyV4Report } from '../../../apps/web/v4/report-adapter.js';
import { createV4ViewModel } from '../../../apps/web/v4/view-models.js';

test('verified report produces canonical JSON, deterministic Markdown and manifest', async () => {
  const verification = await verifyV4Report(report());
  const bundle = await createV4WebExport(verification, createV4ViewModel(verification));
  assert.deepEqual(bundle.files.map((item) => item.filename), ['veilforge-report-v4.json', 'veilforge-report-v4.md', 'veilforge-web-export-manifest.json']);
  assert.equal(JSON.parse(new TextDecoder().decode(bundle.files[0].bytes)).schemaVersion, '4.1.0');
  assert.match(new TextDecoder().decode(bundle.files[1].bytes), /VeilForge V4 Security Report/u);
  assert.equal((await verifyV4WebExport(bundle)).verified, true);
});
test('tampered manifest file is rejected', async () => {
  const verification = await verifyV4Report(report());
  const bundle = await createV4WebExport(verification, createV4ViewModel(verification));
  const changed = structuredClone(bundle); changed.files[0].bytes[0] ^= 1;
  await assert.rejects(verifyV4WebExport(changed), { code: 'WEB_V4_EXPORT_INVALID' });
});
