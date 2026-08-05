import { canonicalProofJson } from './canonical.js';
import { verifyV4ProofEnvelope } from './envelope.js';
import { proofError } from './errors.js';

export const V4_PROOF_STORAGE_NAMESPACE = 'veilforge:v4:proof';
export const LEGACY_PROOF_STORAGE_NAMESPACE = 'veilforge:v3:';

export function proofStorageKey(envelope) {
  verifyV4ProofEnvelope(envelope);
  return `${V4_PROOF_STORAGE_NAMESPACE}:${envelope.chainId}:${envelope.registryAddress.toLowerCase()}:${envelope.reportHash}`;
}

function requireStorage(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw proofError('PROOF_STORAGE_INVALID', { reason: 'storage-interface' });
  }
  return storage;
}

export function persistV4Proof(storage, envelope) {
  verifyV4ProofEnvelope(envelope);
  const key = proofStorageKey(envelope);
  requireStorage(storage).setItem(key, canonicalProofJson(envelope));
  return key;
}

export function loadV4Proof(storage, key) {
  if (!String(key ?? '').startsWith(`${V4_PROOF_STORAGE_NAMESPACE}:`)) throw proofError('PROOF_STORAGE_INVALID', { reason: 'namespace' });
  const raw = requireStorage(storage).getItem(key);
  if (typeof raw !== 'string') return null;
  let envelope;
  try { envelope = JSON.parse(raw); } catch { throw proofError('PROOF_STORAGE_INVALID', { reason: 'parse' }); }
  try { verifyV4ProofEnvelope(envelope); } catch { throw proofError('PROOF_STORAGE_INVALID', { reason: 'verification' }); }
  if (proofStorageKey(envelope) !== key) throw proofError('PROOF_STORAGE_INVALID', { reason: 'identity' });
  return envelope;
}

export function removeV4Proof(storage, key) {
  if (!String(key ?? '').startsWith(`${V4_PROOF_STORAGE_NAMESPACE}:`)) throw proofError('PROOF_STORAGE_INVALID', { reason: 'namespace' });
  const target = requireStorage(storage);
  if (typeof target.removeItem !== 'function') throw proofError('PROOF_STORAGE_INVALID', { reason: 'storage-interface' });
  target.removeItem(key);
}
