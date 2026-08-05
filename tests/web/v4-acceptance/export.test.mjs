import test from 'node:test';
import assert from 'node:assert/strict';
import { report } from '../../v4/report/helpers.mjs';
import { createV4WebExport, verifyV4WebExport } from '../../../apps/web/v4/export-adapter.js';
import { verifyV4Report } from '../../../apps/web/v4/report-adapter.js';
import { createV4ViewModel } from '../../../apps/web/v4/view-models.js';

test('repeated JSON Markdown and manifest exports are byte deterministic and filename safe', async () => {
  const verification = await verifyV4Report(report()); const view = createV4ViewModel(verification);
  const first = await createV4WebExport(verification, view); const second = await createV4WebExport(verification, view);
  assert.equal((await verifyV4WebExport(first)).verified, true);
  assert.deepEqual(first.files.map((file) => [file.filename, [...file.bytes]]), second.files.map((file) => [file.filename, [...file.bytes]]));
  for (const file of first.files) assert.match(file.filename, /^[a-z0-9.-]+$/u);
});

test('large presentation and Unicode project identity do not create unsafe download paths', async () => {
  const verification = await verifyV4Report(report({ project: { projectId: 'özel-proje', canonicalSourceRootId: 'root', domainHints: ['arc-payments'], callableCount: 1 } }));
  const base = createV4ViewModel(verification); const view = { ...base, findings: Array.from({ length: 200 }, () => base.findings[0]) };
  const bundle = await createV4WebExport(verification, view); assert.equal((await verifyV4WebExport(bundle)).verified, true);
  assert.ok(bundle.files.find((file) => file.filename.endsWith('.md')).bytes.byteLength > 1000);
  assert.equal(bundle.files.some((file) => /[\\/]/u.test(file.filename)), false);
});
