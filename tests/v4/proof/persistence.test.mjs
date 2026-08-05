import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_PROOF_STORAGE_NAMESPACE, V4_PROOF_STORAGE_NAMESPACE, loadV4Proof,
  persistV4Proof, proofStorageKey, removeV4Proof,
} from '../../../packages/proof/v4/index.js';
import { memoryStorage, validEnvelope } from './helpers.mjs';

test('V4 proofs use a chain and registry scoped namespace', () => {
  const key = proofStorageKey(validEnvelope());
  assert.ok(key.startsWith(`${V4_PROOF_STORAGE_NAMESPACE}:5042002:`));
});

test('persistence round trips a verified envelope', () => {
  const storage = memoryStorage(); const envelope = validEnvelope();
  const key = persistV4Proof(storage, envelope);
  assert.deepEqual(loadV4Proof(storage, key), envelope);
});

test('persistence does not touch the V3 namespace', () => {
  const storage = memoryStorage({ [`${LEGACY_PROOF_STORAGE_NAMESPACE}history`]: 'legacy' });
  persistV4Proof(storage, validEnvelope());
  assert.equal(storage.getItem(`${LEGACY_PROOF_STORAGE_NAMESPACE}history`), 'legacy');
});

test('tampered persisted proof fails closed', () => {
  const storage = memoryStorage(); const envelope = validEnvelope(); const key = persistV4Proof(storage, envelope);
  const tampered = JSON.parse(storage.getItem(key)); tampered.projectId = 'other'; storage.setItem(key, JSON.stringify(tampered));
  assert.throws(() => loadV4Proof(storage, key), (error) => error.code === 'PROOF_STORAGE_INVALID');
});

test('removal is bounded to V4 proof keys', () => {
  const storage = memoryStorage(); const key = persistV4Proof(storage, validEnvelope());
  removeV4Proof(storage, key); assert.equal(loadV4Proof(storage, key), null);
  assert.throws(() => removeV4Proof(storage, 'veilforge:v3:history'));
});

test('invalid storage adapter fails closed', () => {
  assert.throws(() => persistV4Proof({}, validEnvelope()), (error) => error.code === 'PROOF_STORAGE_INVALID');
});
