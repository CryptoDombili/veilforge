import { canonicalReportJson } from '../../analyzer/src/v4/report/canonical-json.js';
import { sha256Digest } from '../../analyzer/src/v4/report/report-hash.js';
import { proofError } from './errors.js';

const FORBIDDEN_KEYS = new Set([
  '__proto__', 'prototype', 'constructor', 'content', 'sourceCode', 'source', 'ast', 'ir',
  'privateKey', 'seedPhrase', 'mnemonic', 'provider', 'signer', 'rpcUrl', 'rpcUrls',
]);

export function assertSourceFree(value, code = 'PROOF_ENVELOPE_INVALID', { allowReportIrStatus = false } = {}) {
  let visited = 0;
  const ancestors = new WeakSet();
  const visit = (node, depth = 0) => {
    if (!node || typeof node !== 'object') return;
    if (ancestors.has(node)) throw proofError(code, { reason: 'cyclic-structure' });
    visited += 1;
    if (depth > 64 || visited > 10_000) throw proofError(code, { reason: 'structure-limit' });
    ancestors.add(node);
    for (const [key, child] of Object.entries(node)) {
      const allowedIrStatus = allowReportIrStatus && key === 'ir' && node === value?.analysis?.statuses;
      if (FORBIDDEN_KEYS.has(key) && !allowedIrStatus) throw proofError(code, { field: key });
      visit(child, depth + 1);
    }
    ancestors.delete(node);
  };
  visit(value);
  return true;
}

export function canonicalProofJson(value) {
  assertSourceFree(value);
  return canonicalReportJson(value);
}

export function proofDigest(value) {
  assertSourceFree(value);
  return sha256Digest(value);
}

export function digestToBytes32(value, field = 'digest') {
  const match = /^sha256:([0-9a-f]{64})$/u.exec(String(value ?? ''));
  if (!match) throw proofError('PROOF_ENVELOPE_INVALID', { field });
  return `0x${match[1]}`;
}

export function requireBytes32(value, field = 'value') {
  const normalized = String(value ?? '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(normalized)) throw proofError('PROOF_ENVELOPE_INVALID', { field });
  return normalized;
}

export function withoutOperationalFields(envelope) {
  const payload = structuredClone(envelope);
  delete payload.createdAtOperational;
  delete payload.canonicalPayloadDigest;
  delete payload.transactionIdentity;
  return payload;
}
