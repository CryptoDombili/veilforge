import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalProofJson, createV4ProofEnvelope, prepareRegistryPublish } from '../../../packages/proof/v4/index.js';
import { ACCOUNT, validReport } from './helpers.mjs';

test('identical reports produce byte-identical proof envelopes', () => {
  const report = validReport();
  assert.equal(canonicalProofJson(createV4ProofEnvelope(report)), canonicalProofJson(createV4ProofEnvelope(report)));
});

test('domain ordering is canonicalized', () => {
  const left = validReport({ project: { projectId: 'project-1', canonicalSourceRootId: 'root-1', domainHints: ['treasury', 'arc-payments'], callableCount: 1 } });
  const right = validReport({ project: { projectId: 'project-1', canonicalSourceRootId: 'root-1', domainHints: ['arc-payments', 'treasury'], callableCount: 1 } });
  assert.deepEqual(createV4ProofEnvelope(left).scanDomainSummary, createV4ProofEnvelope(right).scanDomainSummary);
});

test('identical envelopes produce byte-identical transaction requests', () => {
  const report = validReport();
  const envelope = createV4ProofEnvelope(report);
  const context = { report, providerChainId: 5_042_002, account: ACCOUNT, signerAvailable: true };
  assert.deepEqual(prepareRegistryPublish(envelope, context), prepareRegistryPublish(envelope, context));
});

test('canonical digest is stable across repeated construction', () => {
  const report = validReport();
  const digests = new Set(Array.from({ length: 20 }, () => createV4ProofEnvelope(report).canonicalPayloadDigest));
  assert.equal(digests.size, 1);
});

test('canonical proof JSON ignores object insertion order', () => {
  const envelope = createV4ProofEnvelope(validReport());
  const reversed = Object.fromEntries(Object.entries(envelope).reverse());
  assert.equal(canonicalProofJson(envelope), canonicalProofJson(reversed));
});

test('LF, CRLF, and BOM source inputs converge on the same report proof', () => {
  const make = (content) => validReport({ inputs: { sources: [{ path: 'src/Case.sol', content }], taxonomyDigest: 'sha256:taxonomy', configurationDigest: 'sha256:config' } });
  const values = ['contract Case {\n}', 'contract Case {\r\n}', '\ufeffcontract Case {\n}'].map((content) => createV4ProofEnvelope(make(content)).reportHash);
  assert.equal(new Set(values).size, 1);
});
