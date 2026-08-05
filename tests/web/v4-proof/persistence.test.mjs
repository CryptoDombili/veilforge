import test from 'node:test';
import assert from 'node:assert/strict';
import { loadVerifiedWebProofPublication, loadWebProofState, saveWebProofState, webProofStorageKey, WEB_PROOF_STORAGE_PREFIX } from '../../../apps/web/v4/proof-persistence.js';
import { ACCOUNT, TX_HASH, memoryStorage, readyProof } from './helpers.mjs';

test('verified proof state round trips in a separate V4 namespace', async () => {
  const storage = memoryStorage(); const proof = await readyProof();
  const saved = await saveWebProofState(storage, { envelope: proof.envelope, preflight: proof.preflight, status: 'ready-to-publish' });
  const loaded = await loadWebProofState(storage, webProofStorageKey(proof.envelope));
  assert.deepEqual(loaded, saved); assert.ok(webProofStorageKey(proof.envelope).startsWith(WEB_PROOF_STORAGE_PREFIX));
});

test('tampered proof persistence is rejected', async () => {
  const storage = memoryStorage(); const proof = await readyProof(); const key = webProofStorageKey(proof.envelope);
  await saveWebProofState(storage, { envelope: proof.envelope, preflight: proof.preflight, status: 'ready-to-publish' });
  const value = JSON.parse(storage.value(key)); value.status = 'confirmed'; storage.setItem(key, JSON.stringify(value));
  await assert.rejects(() => loadWebProofState(storage, key));
});

test('V3 namespace is untouched', async () => {
  const storage = memoryStorage({ 'veilforge:v3.2:scan-history': '[{"legacy":true}]' }); const proof = await readyProof();
  await saveWebProofState(storage, { envelope: proof.envelope, status: 'ready' });
  assert.equal(storage.value('veilforge:v3.2:scan-history'), '[{"legacy":true}]');
});

test('provider signer source AST IR and raw receipt cannot be persisted', async () => {
  const storage = memoryStorage(); const proof = await readyProof();
  for (const forbidden of [{ provider: {} }, { signer: {} }, { sourceCode: 'contract Secret {}' }, { ast: {} }, { ir: {} }, { rawReceipt: {} }]) {
    await assert.rejects(() => saveWebProofState(storage, { envelope: proof.envelope, status: 'confirmed', receiptSummary: forbidden }));
  }
});

test('pending transaction stores validated hash and safe explorer link', async () => {
  const storage = memoryStorage(); const proof = await readyProof();
  const saved = await saveWebProofState(storage, { envelope: proof.envelope, preflight: proof.preflight, status: 'pending', transactionHash: TX_HASH, transactionSource: 'wallet-submission' });
  assert.equal(saved.explorerUrl, `https://testnet.arcscan.app/tx/${TX_HASH}`); assert.equal('transactionRequest' in saved.preflight, false);
});

test('confirmed receipt summary excludes raw receipt and remains serializable', async () => {
  const storage = memoryStorage(); const proof = await readyProof();
  const summary = { chainId: 5_042_002, networkKey: proof.envelope.networkKey, registryAddress: proof.envelope.registryAddress, registryContractVersion: proof.envelope.registryContractVersion, transactionHash: TX_HASH, blockNumber: 42, publisher: ACCOUNT, reportHash: proof.envelope.reportHash, status: 'confirmed', explorerUrl: `https://testnet.arcscan.app/tx/${TX_HASH}` };
  const saved = await saveWebProofState(storage, { envelope: proof.envelope, status: 'confirmed', transactionHash: TX_HASH, transactionSource: 'provider-verified', receiptSummary: summary });
  assert.doesNotThrow(() => JSON.stringify(saved)); assert.doesNotMatch(JSON.stringify(saved), /"(?:logs|data|provider|rawReceipt)":/u);
  assert.deepEqual(await loadVerifiedWebProofPublication(storage, proof.envelope, ACCOUNT), saved);
});

test('mock or unverified transaction identity cannot become confirmed persistence', async () => {
  const storage = memoryStorage(); const proof = await readyProof();
  const summary = { transactionHash: TX_HASH, publisher: ACCOUNT, status: 'confirmed' };
  await assert.rejects(() => saveWebProofState(storage, { envelope: proof.envelope, status: 'confirmed', transactionHash: TX_HASH, receiptSummary: summary }));
  await assert.rejects(() => saveWebProofState(storage, { envelope: proof.envelope, status: 'confirmed', transactionHash: TX_HASH, transactionSource: 'wallet-submission', receiptSummary: summary }));
});

test('provider-verified already-published identity survives refresh and history reopen', async () => {
  const storage = memoryStorage(); const proof = await readyProof();
  const identity = { chainId: proof.envelope.chainId, networkKey: proof.envelope.networkKey, registryAddress: proof.envelope.registryAddress, registryContractVersion: proof.envelope.registryContractVersion, transactionHash: TX_HASH, blockNumber: 42, publisher: ACCOUNT, reportHash: proof.envelope.reportHash, status: 'confirmed', explorerUrl: `https://testnet.arcscan.app/tx/${TX_HASH}` };
  await saveWebProofState(storage, { envelope: proof.envelope, status: 'already-published', transactionHash: TX_HASH, transactionSource: 'provider-verified', receiptSummary: identity });
  const reopened = await loadVerifiedWebProofPublication(storage, proof.envelope, ACCOUNT);
  assert.equal(reopened.status, 'already-published'); assert.deepEqual(reopened.receiptSummary, identity);
});

test('invalid namespace and status fail closed', async () => {
  const storage = memoryStorage(); const proof = await readyProof();
  await assert.rejects(() => loadWebProofState(storage, 'veilforge:v3.2:proof'));
  await assert.rejects(() => saveWebProofState(storage, { envelope: proof.envelope, status: '<script>' }));
});
