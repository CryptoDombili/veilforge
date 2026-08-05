import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { keccakHex } from '../../packages/analyzer/src/keccak.js';

const reportVectors = JSON.parse(fs.readFileSync('tests/vectors/report-hash/vectors.json', 'utf8'));
const policyVectors = JSON.parse(fs.readFileSync('tests/vectors/policy-hash/vectors.json', 'utf8'));

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Canonical JSON forbids non-finite numbers.');
  if (value === undefined) throw new Error('Canonical JSON forbids undefined.');
  return JSON.stringify(value);
}

const hash = (domain, value) => keccakHex(domain + canonicalize(value));

function reportPayload(report) {
  const { reportHash: _reportHash, generatedAt: _generatedAt, hostname: _hostname, executionTimeMs: _executionTimeMs, ...stable } = report;
  return {
    ...stable,
    findings: [...(stable.findings ?? [])].sort((left, right) => `${left.findingId}:${left.occurrenceId ?? ''}`.localeCompare(`${right.findingId}:${right.occurrenceId ?? ''}`)),
  };
}

test('policy hash golden vectors use the v1 policy domain', () => {
  for (const vector of policyVectors.vectors) {
    assert.equal(hash('veilforge:v4:policy:1\0', vector.policy), vector.expectedPolicyHash, vector.name);
  }
});

test('report hash vectors exclude reportHash and runtime metadata', () => {
  for (const vector of reportVectors.vectors) {
    const decorated = { hostname: 'windows-host', executionTimeMs: 987, generatedAt: '2099-01-01T00:00:00Z', ...vector.report, reportHash: `0x${'ff'.repeat(32)}` };
    assert.equal(hash('veilforge:v4:report:1\0', reportPayload(decorated)), vector.expectedReportHash, vector.name);
  }
});

test('canonical hashes are deterministic across 100 repetitions and object insertion order', () => {
  for (const vector of reportVectors.vectors) {
    const reversed = Object.fromEntries(Object.entries(vector.report).reverse());
    const results = new Set();
    for (let iteration = 0; iteration < 100; iteration += 1) {
      results.add(hash('veilforge:v4:report:1\0', reportPayload(iteration % 2 ? vector.report : reversed)));
    }
    assert.deepEqual([...results], [vector.expectedReportHash], vector.name);
  }
});

test('hash domains separate identical payloads', () => {
  const payload = { value: 'same' };
  const values = ['canonical-source', 'finding', 'occurrence', 'policy', 'report'].map((name) => hash(`veilforge:v4:${name}:1\0`, payload));
  assert.equal(new Set(values).size, values.length);
});
