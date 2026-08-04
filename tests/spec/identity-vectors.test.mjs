import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { keccakHex } from '../../packages/analyzer/src/keccak.js';

const identityVectors = JSON.parse(fs.readFileSync('tests/vectors/finding-identity/vectors.json', 'utf8'));
const sourceVectors = JSON.parse(fs.readFileSync('tests/vectors/canonical-source/vectors.json', 'utf8'));

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Canonical JSON forbids non-finite numbers.');
  if (value === undefined) throw new Error('Canonical JSON forbids undefined.');
  return JSON.stringify(value);
}

function domainHash(domain, value) {
  return keccakHex(domain + canonicalize(value));
}

function canonicalPath(value) {
  if (typeof value !== 'string' || !value) throw new Error('Source path is required.');
  const slashed = value.replaceAll('\\', '/').normalize('NFC');
  if (/^[A-Za-z]:\//.test(slashed) || slashed.startsWith('/') || slashed.startsWith('//')) throw new Error('Absolute source paths are forbidden.');
  const parts = [];
  for (const part of slashed.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') throw new Error('Parent path segments are forbidden.');
    parts.push(part);
  }
  if (!parts.length) throw new Error('Source path is empty after normalization.');
  return parts.join('/');
}

function canonicalContent(value) {
  const withoutBom = value.startsWith('\uFEFF') ? value.slice(1) : value;
  return withoutBom.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function canonicalBundle(files) {
  const entries = new Map();
  const collisionKeys = new Set();
  for (const file of files) {
    const normalized = canonicalPath(file.path);
    const collisionKey = normalized.toLowerCase();
    if (collisionKeys.has(collisionKey)) throw new Error(`Normalized source collision: ${normalized}`);
    collisionKeys.add(collisionKey);
    entries.set(normalized, canonicalContent(file.content));
  }
  return Object.fromEntries([...entries].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
}

test('finding and occurrence golden vectors remain stable and distinct', () => {
  for (const vector of identityVectors.vectors) {
    const findingId = domainHash('veilforge:v4:finding:1\0', vector.finding);
    assert.equal(findingId, vector.expectedFindingId, vector.name);
    const occurrenceIds = vector.occurrences.map(({ input, expectedOccurrenceId }) => {
      const actual = domainHash('veilforge:v4:occurrence:1\0', { findingId, ...input });
      assert.equal(actual, expectedOccurrenceId, vector.name);
      return actual;
    });
    assert.equal(new Set(occurrenceIds).size, occurrenceIds.length, `${vector.name}: occurrences collapsed`);
  }
});

test('canonical source vectors normalize CRLF, BOM, Unicode paths, and separators', () => {
  for (const group of sourceVectors.equivalentGroups) {
    const hashes = group.variants.map((files) => {
      const bundle = canonicalBundle(files);
      assert.deepEqual(Object.keys(bundle), group.expectedPaths, group.name);
      return domainHash('veilforge:v4:canonical-source:1\0', bundle);
    });
    assert.deepEqual([...new Set(hashes)], [group.expectedHash], group.name);
  }
});

test('absolute, parent, and colliding paths are rejected', () => {
  for (const vector of sourceVectors.rejectedPathSets) {
    assert.throws(() => canonicalBundle(vector.paths.map((path) => ({ path, content: 'pragma solidity 0.8.24;\n' }))), undefined, vector.name);
  }
});
