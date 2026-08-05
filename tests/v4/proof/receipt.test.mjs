import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachRegistryTransaction, decodeReportPublishedLog, normalizeRegistryReceipt, prepareRegistryPublish,
  verifyRegistryRecord,
} from '../../../packages/proof/v4/index.js';
import { ACCOUNT, TX_HASH, reportPublishedLog, validEnvelope, validReceipt, validReport } from './helpers.mjs';

test('decodes the deployed ReportPublished event ABI', () => {
  const envelope = validEnvelope();
  const event = decodeReportPublishedLog(reportPublishedLog(envelope, { reportURI: 'ipfs://report' }));
  assert.equal(event.publisher, ACCOUNT);
  assert.equal(event.reportURI, 'ipfs://report');
  assert.equal(event.score, 0);
});

test('normalizes a successful trusted registry receipt', () => {
  const envelope = validEnvelope();
  const normalized = normalizeRegistryReceipt(validReceipt(envelope), envelope, { publisher: ACCOUNT });
  assert.equal(normalized.status, 'confirmed');
  assert.equal(normalized.transactionHash, TX_HASH);
  assert.match(normalized.explorerUrl, /testnet\.arcscan\.app/u);
});

test('normalized transaction identity can be attached without changing canonical proof identity', () => {
  const envelope = validEnvelope();
  const identity = normalizeRegistryReceipt(validReceipt(envelope), envelope, { publisher: ACCOUNT });
  const published = attachRegistryTransaction(envelope, identity);
  assert.equal(published.canonicalPayloadDigest, envelope.canonicalPayloadDigest);
  assert.equal(published.transactionIdentity.transactionHash, TX_HASH);
});

test('reverted receipts fail closed', () => {
  const envelope = validEnvelope();
  assert.throws(() => normalizeRegistryReceipt(validReceipt(envelope, { status: '0x0' }), envelope), (error) => error.code === 'PROOF_RECEIPT_INVALID');
});

test('receipt without the registry event fails closed', () => {
  const envelope = validEnvelope();
  assert.throws(() => normalizeRegistryReceipt(validReceipt(envelope, { logs: [] }), envelope), (error) => error.code === 'PROOF_RECEIPT_INVALID');
});

test('event from a different registry is ignored', () => {
  const envelope = validEnvelope();
  const receipt = validReceipt(envelope, { logs: [reportPublishedLog(envelope, { address: ACCOUNT })] });
  assert.throws(() => normalizeRegistryReceipt(receipt, envelope), (error) => error.code === 'PROOF_RECEIPT_INVALID');
});

test('wrong event report hash fails closed', () => {
  const envelope = validEnvelope();
  const log = structuredClone(reportPublishedLog(envelope)); log.topics[3] = `0x${'ff'.repeat(32)}`;
  assert.throws(() => normalizeRegistryReceipt(validReceipt(envelope, { logs: [log] }), envelope), (error) => error.code === 'PROOF_RECEIPT_INVALID');
});

test('wrong event publisher fails closed', () => {
  const envelope = validEnvelope();
  const receipt = validReceipt(envelope, { logs: [reportPublishedLog(envelope, { account: '0x2222222222222222222222222222222222222222' })] });
  assert.throws(() => normalizeRegistryReceipt(receipt, envelope), (error) => error.code === 'PROOF_RECEIPT_INVALID');
});

test('wrong receipt chain fails closed', () => {
  const envelope = validEnvelope();
  assert.throws(() => normalizeRegistryReceipt(validReceipt(envelope), envelope, { providerChainId: 1 }), (error) => error.code === 'PROOF_CHAIN_MISMATCH');
});

test('registry record tuple normalizes without rewriting its values', () => {
  const envelope = validEnvelope();
  const payload = prepareRegistryPublish(envelope, { report: validReport(), providerChainId: 5_042_002, account: ACCOUNT, signerAvailable: true }).payload;
  assert.equal(verifyRegistryRecord([payload.sourceHash, payload.reportHash, 0, payload.scannerVersion, '', ACCOUNT, 12], envelope, { publisher: ACCOUNT }), true);
});
