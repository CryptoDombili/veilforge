import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  createV4ProofEnvelope, normalizeRegistryReceipt, prepareRegistryPublish,
  verifyLegacyProof, verifyV4ProofEnvelope,
} from '../../../packages/proof/v4/index.js';
import { ACCOUNT, legacyReport, validReceipt, validReport } from './helpers.mjs';

function measure(operation, iterations = 10) {
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) operation();
  return (performance.now() - started) / iterations;
}

test('proof core operations remain bounded and UI-safe', (context) => {
  const report = validReport();
  const envelope = createV4ProofEnvelope(report);
  const preflightContext = { report, providerChainId: 5_042_002, account: ACCOUNT, signerAvailable: true };
  const prepared = prepareRegistryPublish(envelope, preflightContext);
  const duplicateContext = { ...preflightContext, existingRecord: { ...prepared.payload, publisher: ACCOUNT } };
  const legacy = legacyReport();
  const receipt = validReceipt(envelope);
  const timings = {
    envelopeCreationMs: measure(() => createV4ProofEnvelope(report)),
    envelopeVerificationMs: measure(() => verifyV4ProofEnvelope(envelope)),
    legacyVerificationMs: measure(() => verifyLegacyProof(legacy)),
    receiptNormalizationMs: measure(() => normalizeRegistryReceipt(receipt, envelope, { publisher: ACCOUNT })),
    duplicateLookupSimulationMs: measure(() => prepareRegistryPublish(envelope, duplicateContext)),
  };
  context.diagnostic(JSON.stringify(timings));
  for (const [operation, duration] of Object.entries(timings)) {
    assert.ok(duration < 250, `${operation} exceeded the 250 ms local bound: ${duration}`);
  }
});
