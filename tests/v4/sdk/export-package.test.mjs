import test from 'node:test';
import assert from 'node:assert/strict';
import { scanProject, verifyReport, verifyExportPackage, getExportFile, listExportFiles } from 'veilforge';
import { tinyInput } from './helpers.mjs';

const resultPromise = scanProject(tinyInput());
test('report and export verification are public', async () => {
  const result = await resultPromise;
  assert.equal(verifyReport(result.report).verified, true); assert.equal(verifyExportPackage(result.exportPackage).verified, true);
  assert.deepEqual(listExportFiles(result.exportPackage), ['veilforge-export-manifest.json', 'veilforge-report-v4.json', 'veilforge-report-v4.md']);
  assert.ok(getExportFile(result.exportPackage, 'veilforge-report-v4.md').length > 0);
});
test('tampered report and export are rejected', async () => {
  const result = await resultPromise;
  const report = structuredClone(result.report); report.summary.totalFindings += 1;
  assert.throws(() => verifyReport(report), { code: 'SDK_REPORT_INVALID' });
  const pkg = structuredClone(result.exportPackage); pkg.files[0].bytes[0] ^= 1;
  assert.throws(() => verifyExportPackage(pkg), { code: 'SDK_EXPORT_INVALID' });
});
