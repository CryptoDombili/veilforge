import test from 'node:test';
import assert from 'node:assert/strict';
import { createVeilForgeClient, scanProject } from 'veilforge';
import { tinyInput } from './helpers.mjs';

const direct = scanProject(tinyInput());
test('one-call scan completes with verified export', async () => {
  const result = await direct;
  assert.equal(result.status, 'completed'); assert.equal(result.ok, true); assert.equal(result.exportVerification.verified, true);
});
test('client performs the same supported scan', async () => {
  const client = createVeilForgeClient({ compiler: { version: '0.8.24' } });
  const result = await client.scanProject({ ...tinyInput(), projectId: 'client-scan' });
  assert.equal(result.ok, true);
});
test('three-domain and no-finding scans are supported', async () => {
  const result = await scanProject({ ...tinyInput(), projectId: 'three-domain', domains: ['arc-payments', 'arc-treasury', 'arc-private-credit'] });
  assert.equal(Object.keys(result.classification).length, 3); assert.equal(result.findingRun.findings.length, 0);
});
