import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const boundary = fs.readFileSync('docs/grant-candidate/product-boundary.md', 'utf8');
const declassification = fs.readFileSync('docs/grant-candidate/source-sink-declassification.md', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');
const adr1 = fs.readFileSync('docs/adr/0001-solc-version-policy.md', 'utf8');
const adr2 = fs.readFileSync('docs/adr/0002-attester-trust-model.md', 'utf8');
const adr3 = fs.readFileSync('docs/adr/0003-declassification-and-policy.md', 'utf8');

test('product boundary contains all required non-claims', () => {
  for (const phrase of [
    'does not replace a security audit',
    'does not perform formal verification',
    'is not a native Arc privacy feature',
    'application-level financial-data disclosure',
  ]) assert.ok(boundary.includes(phrase), `Missing product boundary: ${phrase}`);
});

test('ADR-0001 normatively pins exact solc 0.8.24', () => {
  assert.match(adr1, /supports only exact Solidity compiler version `0\.8\.24`/);
  assert.match(adr1, /`unsupported-compiler`/);
});

test('ADR-0002 normatively requires verifier issuer allowlist', () => {
  assert.match(adr2, /permissionless attestation issuance/);
  assert.match(adr2, /trusts only issuers in the verifier's active allowlist/);
  assert.match(adr2, /official VeilForge publisher/);
});

test('ADR-0003 rejects name-only and plain keccak declassification', () => {
  assert.match(adr3, /Plain `keccak256` does not establish financial privacy/);
  assert.match(declassification, /owner, justification, scope, and expiry/);
  for (const word of ['hash', 'encrypt', 'private', 'commitment']) assert.ok(adr3.includes(`\`${word}\``));
});

test('README distinguishes legacy v3 from the unimplemented Grant Candidate', () => {
  assert.match(readme, /legacy v3/i);
  assert.match(readme, /v4\.0\.0-gc\.1/);
  assert.match(readme, /not yet implemented/i);
});

test('all V4 schemas declare the frozen schema version', () => {
  for (const name of ['finding', 'report', 'policy', 'attestation']) {
    const schema = JSON.parse(fs.readFileSync(`schemas/v4/${name}.schema.json`, 'utf8'));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.properties.schemaVersion.const, '4.0.0');
  }
});
