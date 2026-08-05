import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeWebReportPublishedLog, normalizeWebRegistryReceipt, safeWebExplorerLink } from '../../../apps/web/v4/proof-receipt.js';
import { ACCOUNT, OTHER_ACCOUNT, TX_HASH, publicationLog, readyProof, receipt } from './helpers.mjs';

test('successful mock receipt confirms only after event verification', async () => {
  const proof = await readyProof(); const result = await normalizeWebRegistryReceipt(receipt(proof.envelope, proof.preflight), proof.envelope, { verification: proof.verification, publisher: ACCOUNT, providerChainId: 5_042_002 });
  assert.equal(result.status, 'confirmed'); assert.equal(result.transactionHash, TX_HASH);
});

test('event decoder preserves Registry V2 identity', async () => {
  const proof = await readyProof(); const event = decodeWebReportPublishedLog(publicationLog(proof.envelope, proof.preflight));
  assert.equal(event.reportHash, proof.preflight.payload.reportHash); assert.equal(event.publisher, ACCOUNT);
});

test('reverted receipt never confirms', async () => {
  const proof = await readyProof();
  await assert.rejects(() => normalizeWebRegistryReceipt(receipt(proof.envelope, proof.preflight, { status: '0x0' }), proof.envelope), (error) => error.code === 'WEB_V4_RECEIPT_REVERTED');
});

test('wrong report hash event is rejected', async () => {
  const proof = await readyProof(); const log = publicationLog(proof.envelope, proof.preflight, { reportHash: `0x${'ff'.repeat(32)}` });
  await assert.rejects(() => normalizeWebRegistryReceipt(receipt(proof.envelope, proof.preflight, { logs: [log] }), proof.envelope), (error) => error.code === 'WEB_V4_EVENT_MISMATCH');
});

test('wrong publisher event is rejected', async () => {
  const proof = await readyProof(); const log = publicationLog(proof.envelope, proof.preflight, { account: OTHER_ACCOUNT });
  await assert.rejects(() => normalizeWebRegistryReceipt(receipt(proof.envelope, proof.preflight, { logs: [log] }), proof.envelope, { publisher: ACCOUNT }), (error) => error.code === 'WEB_V4_EVENT_MISMATCH');
});

test('wrong chain receipt context is rejected', async () => {
  const proof = await readyProof();
  await assert.rejects(() => normalizeWebRegistryReceipt(receipt(proof.envelope, proof.preflight), proof.envelope, { providerChainId: 1 }), (error) => error.code === 'WEB_V4_WRONG_NETWORK');
});

test('missing event is rejected', async () => {
  const proof = await readyProof();
  await assert.rejects(() => normalizeWebRegistryReceipt(receipt(proof.envelope, proof.preflight, { logs: [] }), proof.envelope), (error) => error.code === 'WEB_V4_EVENT_MISMATCH');
});

test('wrong registry event is rejected', async () => {
  const proof = await readyProof(); const log = publicationLog(proof.envelope, proof.preflight, { address: ACCOUNT });
  await assert.rejects(() => normalizeWebRegistryReceipt(receipt(proof.envelope, proof.preflight, { logs: [log] }), proof.envelope));
});

test('malformed transaction hash is rejected', async () => {
  const proof = await readyProof();
  await assert.rejects(() => normalizeWebRegistryReceipt(receipt(proof.envelope, proof.preflight, { transactionHash: '0x1' }), proof.envelope), (error) => error.code === 'WEB_V4_TX_INVALID');
});

test('explorer links are fixed-base, chain-aware and injection-safe', () => {
  assert.equal(safeWebExplorerLink(TX_HASH), `https://testnet.arcscan.app/tx/${TX_HASH}`);
  assert.throws(() => safeWebExplorerLink(`${TX_HASH}/../../evil`)); assert.throws(() => safeWebExplorerLink(TX_HASH, 'unsupported'));
});
