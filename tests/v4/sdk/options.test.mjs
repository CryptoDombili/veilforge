import test from 'node:test';
import assert from 'node:assert/strict';
import { SAFE_DEFAULTS, scanProject } from 'veilforge';
import { tinyInput } from './helpers.mjs';

test('unknown options are rejected', async () => assert.rejects(() => scanProject(tinyInput(), { mystery: true }), { code: 'SDK_OPTION_INVALID' }));
test('safe defaults enable determinism and disable operational metadata', async () => {
  assert.equal(SAFE_DEFAULTS.deterministic, true); assert.equal(SAFE_DEFAULTS.includeOperationalMetadata, false);
  const result = await scanProject(tinyInput());
  assert.equal(result.report.scan.operational, null);
});
test('export can be hidden without changing verified completion policy', async () => {
  const result = await scanProject(tinyInput(), { export: false });
  assert.equal(result.ok, true); assert.equal(result.exportPackage, null); assert.equal(result.exportVerification, null);
});
