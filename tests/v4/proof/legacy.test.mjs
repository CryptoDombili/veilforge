import test from 'node:test';
import assert from 'node:assert/strict';
import { detectProofVersion, verifyLegacyProof } from '../../../packages/proof/v4/index.js';
import { legacyReport, validEnvelope } from './helpers.mjs';

const HEX_A = `0x${'aa'.repeat(32)}`;
const HEX_B = `0x${'bb'.repeat(32)}`;
const HEX_C = `0x${'cc'.repeat(32)}`;

test('detects current V4 proof envelopes', () => assert.equal(detectProofVersion(validEnvelope()), 'v4'));

test('detects and verifies schema 4.0.0 hash-v1 reports', () => {
  const report = legacyReport();
  assert.equal(detectProofVersion(report), 'v4-report-legacy');
  assert.equal(verifyLegacyProof(report), true);
});

test('detects and verifies V3 registry payloads without migration', () => {
  const proof = { projectId: HEX_A, sourceHash: HEX_B, reportHash: HEX_C, score: 90, scannerVersion: '3.2.2' };
  assert.equal(detectProofVersion(proof), 'v3-registry-legacy');
  assert.equal(verifyLegacyProof(proof), true);
});

test('detects and verifies V3 Proof Lab snapshots', () => {
  const proof = { version: '3.2-proof-of-fix', proofId: HEX_A, reportHash: HEX_B };
  assert.equal(detectProofVersion(proof), 'v3-legacy');
  assert.equal(verifyLegacyProof(proof), true);
});

test('tampered legacy hash-v1 report fails closed', () => {
  const report = legacyReport(); report.project.projectId = 'tampered';
  assert.throws(() => verifyLegacyProof(report), (error) => error.code === 'PROOF_LEGACY_INVALID');
});

test('malformed V3 registry payload fails closed', () => {
  assert.throws(() => verifyLegacyProof({ projectId: '0x1', sourceHash: HEX_B, reportHash: HEX_C, score: 90, scannerVersion: '3.2.2' }));
});

test('unknown proof versions fail closed', () => {
  assert.throws(() => detectProofVersion({ version: '5.0.0' }), (error) => error.code === 'PROOF_VERSION_UNSUPPORTED');
});
