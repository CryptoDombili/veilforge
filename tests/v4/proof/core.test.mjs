import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIntegrity } from '../../../packages/analyzer/src/v4/report/integrity.js';
import {
  PROOF_ENVELOPE_VERSION, ProofV4Error, createV4ProofEnvelope, prepareRegistryPublish,
  registryPayload, verifyV4ProofEnvelope, verifyV4ReportForProof,
} from '../../../packages/proof/v4/index.js';
import { ACCOUNT, incompleteReport, reseal, validEnvelope, validReport } from './helpers.mjs';

test('creates a versioned V4 proof envelope from a verified report', () => {
  const envelope = validEnvelope();
  assert.equal(envelope.envelopeVersion, PROOF_ENVELOPE_VERSION);
  assert.equal(envelope.reportHashPayloadVersion, 'veilforge.report.hash.v2');
  assert.equal(envelope.reportIntegrityStatus, 'verified');
});

test('envelope contains no source content', () => {
  assert.doesNotMatch(JSON.stringify(validEnvelope()), /contract Case|sourceCode|privateKey/u);
});

test('complete reports disclose no incomplete reasons', () => {
  const envelope = validEnvelope();
  assert.equal(envelope.complete, true);
  assert.deepEqual(envelope.incompleteReasonCodes, []);
});

test('verified incomplete reports produce explicitly incomplete envelopes', () => {
  const envelope = createV4ProofEnvelope(incompleteReport());
  assert.equal(envelope.complete, false);
  assert.deepEqual(envelope.incompleteReasonCodes, ['unsupported-expression']);
});

test('operational timestamp is excluded from the canonical payload digest', () => {
  const report = validReport();
  const left = createV4ProofEnvelope(report, { createdAtOperational: '2026-08-05T00:00:00Z' });
  const right = createV4ProofEnvelope(report, { createdAtOperational: '2026-08-06T00:00:00Z' });
  assert.equal(left.canonicalPayloadDigest, right.canonicalPayloadDigest);
});

test('tampered report fails closed even when verified flag remains true', () => {
  const report = validReport();
  report.project.projectId = 'tampered';
  assert.throws(() => createV4ProofEnvelope(report), (error) => error.code === 'PROOF_INTEGRITY_INVALID');
});

test('wrong hash payload version is rejected', () => {
  const report = validReport(); report.integrity.hashPayloadVersion = 'veilforge.report.hash.v1';
  assert.throws(() => createV4ProofEnvelope(report), (error) => error.code === 'PROOF_VERSION_UNSUPPORTED');
});

test('wrong report hash is rejected', () => {
  const report = validReport(); report.integrity.reportHash = `sha256:${'00'.repeat(32)}`;
  assert.throws(() => createV4ProofEnvelope(report), (error) => error.code === 'PROOF_INTEGRITY_INVALID');
});

test('schema validation runs before proof creation', () => {
  const report = validReport();
  report.unexpected = true;
  assert.throws(() => createV4ProofEnvelope(report), (error) => error.code === 'PROOF_SCHEMA_INVALID');
});

test('V4 proof creation rejects schema 4.0.0', () => {
  const report = validReport();
  report.schemaVersion = '4.0.0'; report.reportVersion = '4.0.0'; report.scanner.reportSchemaVersion = '4.0.0';
  buildIntegrity(report);
  assert.throws(() => createV4ProofEnvelope(report), (error) => error.code === 'PROOF_VERSION_UNSUPPORTED');
});

test('compiler identity must be exact solc 0.8.24', () => {
  const report = validReport(); report.compiler.version = '0.8.25'; reseal(report);
  assert.throws(() => createV4ProofEnvelope(report), (error) => error.code === 'PROOF_COMPILER_INVALID');
});

test('analyzer identity must be bounded and explicit', () => {
  const report = validReport(); report.scanner.engineVersion = ''; reseal(report);
  assert.throws(() => createV4ProofEnvelope(report), (error) => error.code === 'PROOF_ANALYZER_INVALID');
});

test('unsafe source paths fail closed', () => {
  const report = validReport(); report.findings[0].primaryLocation.sourcePath = '../secret.sol'; reseal(report);
  assert.throws(() => createV4ProofEnvelope(report), (error) => error.code === 'PROOF_LOCATION_UNSAFE');
});

test('locations must resolve to the source manifest', () => {
  const report = validReport(); report.findings[0].primaryLocation.sourcePath = 'src/Other.sol'; reseal(report);
  assert.throws(() => createV4ProofEnvelope(report), (error) => error.code === 'PROOF_LOCATION_UNSAFE');
});

test('reversed byte ranges fail closed', () => {
  const report = validReport(); report.findings[0].primaryLocation.endByte = 1; reseal(report);
  assert.throws(() => verifyV4ReportForProof(report), (error) => error.code === 'PROOF_LOCATION_UNSAFE');
});

test('complete reports cannot carry incomplete reasons', () => {
  const report = validReport(); report.analysis.incompleteReasons = ['hidden']; reseal(report);
  assert.throws(() => createV4ProofEnvelope(report), (error) => error.code === 'PROOF_INCOMPLETE_INVALID');
});

test('policy summary inconsistency fails closed', () => {
  const report = validReport(); report.summary.policyApproved = 1; reseal(report);
  assert.throws(() => createV4ProofEnvelope(report), (error) => error.code === 'PROOF_POLICY_INVALID');
});

test('envelope tampering is detected', () => {
  const envelope = structuredClone(validEnvelope()); envelope.findingSummary.total += 1;
  assert.throws(() => verifyV4ProofEnvelope(envelope), ProofV4Error);
});

test('envelope verification can bind the original report', () => {
  const report = validReport(); const envelope = createV4ProofEnvelope(report);
  assert.equal(verifyV4ProofEnvelope(envelope, { report }), true);
});

test('registry ABI uses neutral legacy score without creating a security score', () => {
  const payload = registryPayload(validEnvelope());
  assert.equal(payload.score, 0);
});

test('preflight makes no wallet or provider request', () => {
  let calls = 0;
  const report = validReport();
  const result = prepareRegistryPublish(createV4ProofEnvelope(report), {
    report,
    providerChainId: 5_042_002, account: ACCOUNT, signerAvailable: true,
    provider: { request() { calls += 1; } },
  });
  assert.equal(result.status, 'ready');
  assert.equal(calls, 0);
  assert.ok(result.transactionRequest.data.startsWith('0x6133eb3a'));
});

test('preflight requires the verified report binding', () => {
  assert.throws(() => prepareRegistryPublish(validEnvelope(), {
    providerChainId: 5_042_002, account: ACCOUNT, signerAvailable: true,
  }), (error) => error.code === 'PROOF_INTEGRITY_INVALID');
});
