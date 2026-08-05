import { keccakHex } from '../../../packages/analyzer/src/keccak.js';
import { checksumAddress, normalizeChainId, resolveProofNetwork } from '../../../packages/proof/v4/network.js';
import { deepFreeze } from './canonical.js';
import { webV4Error } from './errors.js';
import { createWebRegistryPayload, verifyWebProofEnvelope } from './proof-adapter.js';

export const WEB_REPORT_PUBLISHED_TOPIC = keccakHex('ReportPublished(bytes32,bytes32,bytes32,uint16,string,string,address)');
const HEX32 = /^0x[0-9a-f]{64}$/u;
const fail = (code, message) => { throw webV4Error(code, message); };
const stripHex = (value) => String(value ?? '').replace(/^0x/iu, '').toLowerCase();
const word = (hex, index) => hex.slice(index * 64, (index + 1) * 64);

function uint(hex, field) {
  if (!/^[0-9a-f]{64}$/u.test(hex)) fail('WEB_V4_RECEIPT_INVALID', `Invalid ${field}.`);
  const value = Number.parseInt(hex, 16);
  if (!Number.isSafeInteger(value)) fail('WEB_V4_RECEIPT_INVALID', `Invalid ${field}.`);
  return value;
}

function stringValue(data, offset, field) {
  if (!Number.isSafeInteger(offset) || offset < 128 || offset % 32 !== 0) fail('WEB_V4_RECEIPT_INVALID', `Invalid ${field}.`);
  const start = offset * 2;
  const length = uint(data.slice(start, start + 64), field);
  if (length > 512) fail('WEB_V4_RECEIPT_INVALID', `Invalid ${field}.`);
  const body = data.slice(start + 64, start + 64 + length * 2);
  if (body.length !== length * 2 || !/^[0-9a-f]*$/u.test(body)) fail('WEB_V4_RECEIPT_INVALID', `Invalid ${field}.`);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(body.match(/../gu) ?? [], (byte) => Number.parseInt(byte, 16))); }
  catch { fail('WEB_V4_RECEIPT_INVALID', `Invalid ${field}.`); }
}

export function decodeWebReportPublishedLog(log) {
  if (!Array.isArray(log?.topics) || log.topics.length !== 4 || String(log.topics[0]).toLowerCase() !== WEB_REPORT_PUBLISHED_TOPIC.toLowerCase()) fail('WEB_V4_EVENT_MISMATCH', 'Registry event signature mismatch.');
  const data = stripHex(log.data);
  if (!/^[0-9a-f]+$/u.test(data) || data.length < 256 || data.length > 16_384) fail('WEB_V4_RECEIPT_INVALID', 'Registry event data is invalid.');
  const publisherWord = word(data, 3);
  if (!/^0{24}[0-9a-f]{40}$/u.test(publisherWord)) fail('WEB_V4_RECEIPT_INVALID', 'Registry publisher is invalid.');
  let publisher;
  try { publisher = checksumAddress(`0x${publisherWord.slice(24)}`, 'publisher'); }
  catch { fail('WEB_V4_RECEIPT_INVALID', 'Registry publisher is invalid.'); }
  return deepFreeze({
    projectId: String(log.topics[1]).toLowerCase(),
    sourceHash: String(log.topics[2]).toLowerCase(),
    reportHash: String(log.topics[3]).toLowerCase(),
    score: uint(word(data, 0), 'score'),
    scannerVersion: stringValue(data, uint(word(data, 1), 'scannerVersionOffset'), 'scannerVersion'),
    reportURI: stringValue(data, uint(word(data, 2), 'reportUriOffset'), 'reportURI'),
    publisher,
  });
}

export function safeWebExplorerLink(transactionHash, networkKey = 'arc-testnet') {
  const hash = String(transactionHash ?? '').toLowerCase();
  if (!HEX32.test(hash)) fail('WEB_V4_TX_INVALID', 'Transaction hash is invalid.');
  const network = resolveProofNetwork(networkKey);
  return `${network.explorerBaseUrl}/tx/${hash}`;
}

export async function normalizeWebRegistryReceipt(receipt, envelope, expected = {}) {
  await verifyWebProofEnvelope(envelope, expected.verification ? { verification: expected.verification } : {});
  const network = resolveProofNetwork(envelope.networkKey);
  const chainId = normalizeChainId(expected.providerChainId ?? envelope.chainId);
  if (chainId !== network.chainId) fail('WEB_V4_WRONG_NETWORK', 'Receipt chain does not match Arc Testnet.');
  if (!(receipt?.status === true || receipt?.status === 1 || receipt?.status === '1' || receipt?.status === '0x1')) fail('WEB_V4_RECEIPT_REVERTED', 'The registry transaction reverted.');
  const transactionHash = String(receipt.transactionHash ?? '').toLowerCase();
  if (!HEX32.test(transactionHash)) fail('WEB_V4_TX_INVALID', 'Transaction hash is invalid.');
  const blockNumber = normalizeChainId(receipt.blockNumber);
  let publisher;
  try { publisher = checksumAddress(expected.publisher ?? receipt.from, 'publisher'); }
  catch { fail('WEB_V4_RECEIPT_INVALID', 'Receipt publisher is invalid.'); }
  const log = (receipt.logs ?? []).find((candidate) => String(candidate?.address ?? '').toLowerCase() === network.registryAddress.toLowerCase()
    && String(candidate?.topics?.[0] ?? '').toLowerCase() === WEB_REPORT_PUBLISHED_TOPIC.toLowerCase());
  if (!log) fail('WEB_V4_EVENT_MISMATCH', 'The trusted registry publication event is missing.');
  const event = decodeWebReportPublishedLog(log);
  const payload = await createWebRegistryPayload(envelope, event.reportURI);
  if (event.projectId !== payload.projectId || event.sourceHash !== payload.sourceHash || event.reportHash !== payload.reportHash
    || event.score !== payload.score || event.scannerVersion !== payload.scannerVersion
    || event.publisher.toLowerCase() !== publisher.toLowerCase()) fail('WEB_V4_EVENT_MISMATCH', 'Registry event identity does not match the proof.');
  return deepFreeze({
    chainId: network.chainId,
    networkKey: network.networkKey,
    registryAddress: network.registryAddress,
    registryContractVersion: network.registryContractVersion,
    transactionHash,
    blockNumber,
    publisher,
    reportHash: envelope.reportHash,
    status: 'confirmed',
    explorerUrl: safeWebExplorerLink(transactionHash, network.networkKey),
  });
}
