import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { browserScan, VeilForgeV4BrowserRuntime } from './helpers.mjs';

test('browser scanner runtime exports the exact pinned compiler contract', () => {
  assert.equal(globalThis.VeilForgeV4BrowserRuntime, VeilForgeV4BrowserRuntime);
  assert.equal(VeilForgeV4BrowserRuntime.compilerVersion, '0.8.24');
  assert.equal(VeilForgeV4BrowserRuntime.capabilities.networkRequired, false);
});
for (const [caseId, detector, incomplete] of [
  ['PAY-POS-001', 'arc-payments.public-storage-disclosure', false],
  ['TRE-NEG-001', null, false],
  ['CRD-ADV-001', 'arc-private-credit.public-storage-disclosure', true],
]) test(`real browser runtime scan: ${caseId}`, async () => {
  const result = await browserScan(caseId);
  assert.equal(result.report.reportVersion, '4.1.0');
  assert.equal(result.report.integrity.hashPayloadVersion, 'veilforge.report.hash.v2');
  assert.equal(result.verification.verified, true);
  assert.equal(result.report.analysis.complete, !incomplete);
  if (detector) assert.ok(result.report.findings.some((finding) => finding.detectorId === detector));
  else assert.equal(result.report.findings.length, 0);
  for (const finding of result.report.findings) assert.ok(!/^(?:\/|[A-Za-z]:)/u.test(finding.primaryLocation?.sourcePath ?? ''));
});

test('verified report creates and verifies a browser export', async () => {
  const result = await browserScan('PAY-POS-001');
  const verification = await VeilForgeV4BrowserRuntime.verifyReport(result.report);
  const exported = await VeilForgeV4BrowserRuntime.createExport(result.report);
  assert.equal(verification.reportHash, result.reportHash);
  assert.equal(exported.manifest.verified, true);
});

test('ArcPaymentsDemo completes while compiler diagnostics remain fail-closed', async () => {
  const source = fs.readFileSync(new URL('../../fixtures/p0/ArcPaymentsDemo.sol', import.meta.url), 'utf8');
  const input = { projectId: 'ArcPaymentsDemo', sources: { 'ArcPaymentsDemo.sol': { content: source } }, compiler: { version: '0.8.24' }, domains: ['arc-payments', 'arc-treasury', 'arc-private-credit'] };
  const result = await VeilForgeV4BrowserRuntime.scanProject(input);
  assert.equal(result.verification.verified, true);
  assert.ok(result.report.findings.length > 0);
  await assert.rejects(VeilForgeV4BrowserRuntime.scanProject({ ...input, projectId: 'ArcPaymentsDemo-malformed', sources: { 'ArcPaymentsDemo.sol': { content: source.replaceAll('paymentReference', 'reference') } } }), (error) => error.code === 'WEB_V4_COMPILE_FAILED' && error.safeDetails.failureType === 'compile' && error.safeDetails.stage === 'compilation' && error.safeDetails.diagnosticCount === 1 && error.safeDetails.compilerDiagnostics[0].errorCode === '2314');
});
