import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalProofJson, createV4ProofEnvelope, prepareRegistryPublish, verifyV4ProofEnvelope,
} from '../../../packages/proof/v4/index.js';
import { ACCOUNT, reseal, validEnvelope, validReport } from './helpers.mjs';

test('prototype pollution keys are rejected from canonical proof data', () => {
  const polluted = JSON.parse('{"safe":true,"__proto__":{"polluted":true}}');
  assert.throws(() => canonicalProofJson(polluted));
  assert.equal({}.polluted, undefined);
});

test('unknown envelope fields are rejected', () => {
  const envelope = structuredClone(validEnvelope()); envelope.walletProvider = 'injected';
  assert.throws(() => verifyV4ProofEnvelope(envelope));
});

test('missing envelope metadata is rejected', () => {
  const envelope = structuredClone(validEnvelope()); delete envelope.policyStatus;
  assert.throws(() => verifyV4ProofEnvelope(envelope));
});

test('source-bearing envelope keys are rejected', () => {
  const envelope = structuredClone(validEnvelope()); envelope.sourceCode = 'secret';
  assert.throws(() => verifyV4ProofEnvelope(envelope));
});

test('absolute Windows source paths are rejected', () => {
  const report = validReport(); report.findings[0].primaryLocation.sourcePath = 'C:\\private\\Case.sol'; reseal(report);
  assert.throws(() => createV4ProofEnvelope(report), (error) => error.code === 'PROOF_LOCATION_UNSAFE');
});

test('negative byte locations are rejected', () => {
  const report = validReport(); report.findings[0].primaryLocation.startByte = -1; reseal(report);
  assert.throws(() => createV4ProofEnvelope(report), (error) => error.code === 'PROOF_LOCATION_UNSAFE');
});

test('non-finite byte locations are rejected', () => {
  const report = validReport(); report.findings[0].primaryLocation.startByte = Number.POSITIVE_INFINITY;
  assert.throws(() => { reseal(report); createV4ProofEnvelope(report); });
});

test('oversized project identity is rejected before ABI encoding', () => {
  const report = validReport(); report.project.projectId = 'x'.repeat(257); reseal(report);
  const envelope = createV4ProofEnvelope(report);
  assert.throws(() => prepareRegistryPublish(envelope, { report, providerChainId: 5_042_002, account: ACCOUNT, signerAvailable: true }));
});

test('oversized report URI is rejected', () => {
  assert.throws(() => prepareRegistryPublish(validEnvelope(), {
    report: validReport(), providerChainId: 5_042_002, account: ACCOUNT, signerAvailable: true, reportURI: 'x'.repeat(513),
  }));
});

test('invalid operational timestamp is rejected', () => {
  assert.throws(() => createV4ProofEnvelope(validReport(), { createdAtOperational: 'not-a-date' }));
});

test('error messages do not disclose source paths or raw exceptions', () => {
  const report = validReport(); report.findings[0].primaryLocation.sourcePath = '../top-secret/Case.sol'; reseal(report);
  let error; try { createV4ProofEnvelope(report); } catch (caught) { error = caught; }
  assert.ok(error);
  assert.doesNotMatch(JSON.stringify(error), /top-secret|Case\.sol|\.\.\//u);
});

test('malformed report hash fails closed', () => {
  const envelope = structuredClone(validEnvelope()); envelope.reportHash = 'sha256:00';
  assert.throws(() => verifyV4ProofEnvelope(envelope));
});

test('wrong network identity cannot be hidden by a recomputed digest', () => {
  const envelope = structuredClone(validEnvelope()); envelope.chainId = 1;
  assert.throws(() => verifyV4ProofEnvelope(envelope));
});

test('deeply nested proof data is bounded', () => {
  let value = {}; const root = value;
  for (let index = 0; index < 70; index += 1) { value.next = {}; value = value.next; }
  assert.throws(() => canonicalProofJson(root));
});

test('Unicode project identities remain source-free and serializable', () => {
  const report = validReport(); report.project.projectId = 'proje-İstanbul-🔐'; reseal(report);
  const envelope = createV4ProofEnvelope(report);
  assert.equal(envelope.projectId, 'proje-İstanbul-🔐');
  assert.doesNotThrow(() => canonicalProofJson(envelope));
});
