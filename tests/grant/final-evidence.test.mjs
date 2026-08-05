import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'docs/grant/final/grant-evidence-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

function canonicalDigest(value) {
  const payload = structuredClone(value);
  delete payload.generatedAtOperational;
  delete payload.integrityDigest;
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonicalize(payload))).digest('hex')}`;
}

test('grant evidence manifest parses and references existing evidence', () => {
  assert.equal(manifest.packageVersion, '1.0.0');
  assert.equal(manifest.productVersion, '4.0.0-gc.1');
  assert.match(manifest.gitCommit, /^[0-9a-f]{40}$/u);
  assert.equal(manifest.evidenceFiles.length, 13);
  for (const relative of manifest.evidenceFiles) assert.equal(fs.existsSync(path.join(root, relative)), true, relative);
  for (const relative of manifest.evidenceFiles) assert.equal(manifest.evidenceFileDigests[relative], `sha256:${crypto.createHash('sha256').update(read(relative)).digest('hex')}`, relative);
  const statuses = new Set(['shipped-and-verified', 'shipped-with-bounded-limitations', 'roadmap', 'mainnet-unresolved', 'commercial-hypothesis', 'not-claimed']);
  for (const claim of manifest.claims) {
    assert.equal(statuses.has(claim.status), true, `${claim.id}: ${claim.status}`);
    assert.equal(fs.existsSync(path.join(root, claim.evidence)), true, claim.evidence);
  }
});

test('internal evidence references resolve and executive summaries meet requested lengths', () => {
  for (const evidenceFile of manifest.evidenceFiles) {
    const markdown = read(evidenceFile);
    for (const match of markdown.matchAll(/`((?:docs|apps|packages|benchmarks|tests|schemas|scripts)\/[^`\s,;]+)`/gu)) {
      const relative = match[1].replace(/[.:]+$/u, '');
      assert.equal(fs.existsSync(path.join(root, relative)), true, `${evidenceFile}: ${relative}`);
    }
  }
  const summary = read('docs/grant/final/executive-summary.md');
  const wordCount = (from, to) => (summary.slice(summary.indexOf(from) + from.length, summary.indexOf(to)).match(/[A-Za-z0-9]+(?:[’'./-][A-Za-z0-9]+)*/gu) ?? []).length;
  assert.equal(wordCount('## 100-word summary', '## 250-word summary'), 100);
  assert.equal(wordCount('## 250-word summary', '## 500-word technical summary'), 250);
  assert.equal(wordCount('## 500-word technical summary', '## Why now'), 500);
});

test('canonical grant manifest digest is deterministic and excludes operational time', () => {
  const first = canonicalDigest(manifest);
  const changedTime = { ...manifest, generatedAtOperational: '2099-01-01T00:00:00Z' };
  assert.equal(canonicalDigest(changedTime), first);
  assert.equal(manifest.integrityDigest, first);
  assert.equal(canonicalDigest(JSON.parse(JSON.stringify(manifest))), first);
});

test('transaction identity matches release acceptance evidence', () => {
  const tx = manifest.transactionIdentity;
  assert.deepEqual({
    transactionHash: tx.transactionHash,
    blockNumber: tx.blockNumber,
    publisher: tx.publisher,
    registry: tx.registry,
    reportHash: tx.reportHash,
  }, {
    transactionHash: '0xdb674c986195ed9b3950f34d058637fbb2b887f58ca724400225ba177884192c',
    blockNumber: 55469453,
    publisher: '0x60B6333a0722bBEA39d4026b284Ae1E142bEb914',
    registry: '0x88B4055eaB061CEa9BdfefF524f65ff461B5401d',
    reportHash: 'sha256:fce5ffa529c79d185a6013a362e25658020d1691550557d59173c9acc6a417ea',
  });
  const evidence = read('docs/releases/v4-arc-testnet-proof-acceptance.md');
  for (const value of [tx.transactionHash, String(tx.blockNumber), tx.publisher, tx.registry, tx.reportHash]) assert.match(evidence, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.equal(tx.testnetOnly && tx.receiptVerified && tx.eventVerified && tx.reportHashMatched, true);
  assert.match(tx.duplicateProtection, /transactionRequest=null; second send blocked/u);
});

test('benchmark summary matches the maintained oracle and release evidence', () => {
  const oracle = JSON.parse(read('benchmarks/v4/oracle.json'));
  assert.equal(oracle.cases.length, 60);
  for (const domain of ['arc-payments', 'arc-treasury', 'arc-private-credit']) {
    const cases = oracle.cases.filter((item) => item.domain === domain);
    assert.equal(cases.length, 20);
    assert.equal(cases.filter((item) => item.kind === 'positive').length, 8);
    assert.equal(cases.filter((item) => item.kind === 'negative').length, 6);
    assert.equal(cases.filter((item) => item.kind === 'adversarial').length, 6);
  }
  assert.deepEqual(manifest.benchmarkSummary, {
    oracleVersion: '1.0.0', corpusSize: 60, casesPassed: 60, truePositives: 56,
    falsePositives: 0, falseNegatives: 0, negativeFalsePositives: 0,
    releaseGateStatus: 'passed', releaseGateDecision: 'allow', nondeterministicResults: 0,
    scope: 'maintained oracle corpus only', universalCorrectnessClaimed: false, auditReplacementClaimed: false,
  });
  const release = read('docs/releases/v4.0.0-rc1.md');
  for (const claim of ['60/60', '56 true positives', '0 false positives', '0 false negatives', 'passed / allow']) assert.match(release, new RegExp(claim, 'u'));
});

test('budget and month-12 MRR arithmetic are consistent', () => {
  assert.equal(Object.values(manifest.budgetAllocationPercent).reduce((sum, value) => sum + value, 0), 100);
  for (const scenario of Object.values(manifest.commercialStatus.scenarios)) {
    const expected = scenario.developerCustomers * 29 + scenario.teamCustomers * 149 + scenario.enterprisePilots * scenario.enterpriseMonthlyEquivalentUsd;
    assert.equal(scenario.month12MrrUsd, expected);
  }
  assert.deepEqual(Object.values(manifest.commercialStatus.scenarios).map((item) => item.month12MrrUsd), [588, 3997, 14705]);
  assert.equal(manifest.commercialStatus.paidPlansLive, false);
  assert.equal(manifest.commercialStatus.billingLive, false);
});

test('mainnet and unsupported-claim boundaries fail closed', () => {
  assert.deepEqual({ enabled: manifest.mainnetStatus.enabled, proofReadEnabled: manifest.mainnetStatus.proofReadEnabled, publishEnabled: manifest.mainnetStatus.publishEnabled, deployed: manifest.mainnetStatus.deployed }, { enabled: false, proofReadEnabled: false, publishEnabled: false, deployed: false });
  const corpus = manifest.evidenceFiles.map(read).join('\n');
  for (const unsupported of [/Circle endorses VeilForge/iu, /Arc endorses VeilForge/iu, /grant (?:is )?guaranteed/iu, /universal correctness is proven/iu, /production billing is live/iu, /mainnet (?:is )?deployed/iu]) assert.doesNotMatch(corpus, unsupported);
  assert.match(corpus, /not (?:a |an )?(?:audit|endorsement|forecast|guarantee)/iu);
});
