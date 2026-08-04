import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const manifest = JSON.parse(fs.readFileSync('tests/corpus/manifest.json', 'utf8'));
const domains = ['arc-payments', 'arc-treasury', 'arc-private-credit'];
const sinks = ['public-storage-getter', 'event', 'calldata', 'return', 'revert-custom-error', 'external-call', 'metadata-uri'];
const requiredTags = [
  'comment-keyword', 'string-keyword', 'misleading-modifier', 'shadowing', 'duplicate-occurrence',
  'crlf', 'utf8-bom', 'unicode-identifier', 'windows-path', 'inheritance-override',
  'overloaded-function', 'missing-import', 'inline-assembly-yul', 'delegatecall-proxy',
  'compiler-version-mismatch',
];

function countBy(values, key) {
  return Object.fromEntries([...values.reduce((map, value) => map.set(value[key], (map.get(value[key]) ?? 0) + 1), new Map())]);
}

test('corpus manifest freezes candidate and exact compiler versions', () => {
  assert.equal(manifest.schemaVersion, '1.0.0');
  assert.equal(manifest.candidateVersion, '4.0.0-gc.1');
  assert.deepEqual(manifest.compiler, { name: 'solc', version: '0.8.24', mode: 'exact' });
});

test('corpus has exactly 60 unique cases with the required distribution', () => {
  assert.equal(manifest.cases.length, 60);
  assert.equal(new Set(manifest.cases.map((entry) => entry.id)).size, 60);
  assert.deepEqual(countBy(manifest.cases, 'classification'), { adversarial: 18, negative: 18, positive: 24 });
  assert.deepEqual(countBy(manifest.cases, 'domain'), { 'arc-private-credit': 20, 'arc-payments': 20, 'arc-treasury': 20 });
  for (const domain of domains) {
    const cases = manifest.cases.filter((entry) => entry.domain === domain);
    assert.deepEqual(countBy(cases, 'classification'), { adversarial: 6, negative: 6, positive: 8 }, domain);
  }
});

test('every domain covers every normative sink and required adversarial tag', () => {
  for (const domain of domains) {
    const covered = new Set(manifest.cases.filter((entry) => entry.domain === domain).flatMap((entry) => entry.sinks));
    assert.deepEqual([...covered].sort(), [...sinks].sort(), domain);
  }
  const tags = new Set(manifest.cases.flatMap((entry) => entry.tags));
  for (const tag of requiredTags) assert.ok(tags.has(tag), `Missing adversarial tag: ${tag}`);
});

test('every case has a single case directory and complete contract files', () => {
  for (const entry of manifest.cases) {
    assert.match(entry.id, /^(PAY|TRE|CRD)-(POS|NEG|ADV)-\d{3}$/);
    assert.equal(entry.path, `tests/corpus/${entry.domain}/${entry.classification}/${entry.id}`);
    assert.ok(entry.behavior.length >= 12, `${entry.id}: behavior is too short`);
    assert.ok(entry.sensitiveClasses.length >= 1, `${entry.id}: sensitive class missing`);
    assert.ok(entry.tags.length >= 1, `${entry.id}: tags missing`);

    for (const file of ['compiler.json', 'policy.json', 'expected.json', 'rationale.md']) {
      assert.ok(fs.existsSync(path.join(entry.path, file)), `${entry.id}: missing ${file}`);
    }
    const sources = fs.readdirSync(path.join(entry.path, 'project', 'src'), { recursive: true }).filter((name) => name.endsWith('.sol'));
    assert.ok(sources.length >= 1, `${entry.id}: Solidity source missing`);

    const compiler = JSON.parse(fs.readFileSync(path.join(entry.path, 'compiler.json'), 'utf8'));
    const policy = JSON.parse(fs.readFileSync(path.join(entry.path, 'policy.json'), 'utf8'));
    const expected = JSON.parse(fs.readFileSync(path.join(entry.path, 'expected.json'), 'utf8'));
    const rationale = fs.readFileSync(path.join(entry.path, 'rationale.md'), 'utf8');

    assert.equal(compiler.mode, 'exact', `${entry.id}: compiler mode`);
    if (entry.tags.includes('compiler-version-mismatch')) {
      assert.notEqual(compiler.version, '0.8.24');
      assert.equal(expected.analysisStatus, 'unsupported-compiler');
    } else {
      assert.equal(compiler.version, '0.8.24', `${entry.id}: compiler version`);
    }
    if (entry.tags.includes('path-collision')) {
      assert.equal(compiler.declaredSourcePaths.length, 2, `${entry.id}: colliding path aliases missing`);
      assert.equal(new Set(compiler.declaredSourcePaths.map((value) => value.replaceAll('\\', '/').toLowerCase())).size, 1, `${entry.id}: aliases do not collide`);
      assert.equal(expected.analysisStatus, 'analysis-incomplete');
    }
    assert.equal(policy.schemaVersion, '4.0.0');
    assert.equal(policy.domain, entry.domain);
    assert.ok(Array.isArray(policy.approvedWrappers));
    assert.ok(Array.isArray(policy.publicFields));
    assert.ok(Array.isArray(policy.acceptedRisks));
    for (const risk of policy.acceptedRisks) {
      for (const field of ['id', 'owner', 'justification', 'scope', 'expiresAt']) assert.ok(risk[field], `${entry.id}: accepted risk missing ${field}`);
    }
    assert.equal(expected.caseId, entry.id);
    assert.equal(expected.classification, entry.classification);
    assert.ok(Array.isArray(expected.expectedFindings));
    assert.ok(rationale.includes(entry.behavior), `${entry.id}: rationale does not state the behavior`);
    if (entry.classification === 'positive') assert.ok(expected.expectedOpenFindingCount > 0, `${entry.id}: positive case has no open finding`);
    if (entry.classification === 'negative') assert.equal(expected.expectedOpenFindingCount, 0, `${entry.id}: negative case has an open finding`);
  }
});

test('duplicate occurrences, CRLF, and UTF-8 BOM are represented physically', () => {
  const duplicate = JSON.parse(fs.readFileSync('tests/corpus/arc-payments/adversarial/PAY-ADV-005/expected.json', 'utf8'));
  assert.equal(duplicate.expectedFindings[0].occurrenceCount, 2);

  const crlf = fs.readFileSync('tests/corpus/arc-payments/adversarial/PAY-ADV-006/project/src/Case.sol');
  assert.ok(crlf.includes(Buffer.from('\r\n')), 'CRLF fixture contains no CRLF bytes');

  const bom = fs.readFileSync('tests/corpus/arc-treasury/adversarial/TRE-ADV-001/project/src/Case.sol');
  assert.deepEqual([...bom.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});
