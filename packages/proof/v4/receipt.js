import { keccakHex } from '../../analyzer/src/keccak.js';
import { digestToBytes32, requireBytes32 } from './canonical.js';
import { verifyV4ProofEnvelope } from './envelope.js';
import { proofError } from './errors.js';
import { assertTrustedNetwork, checksumAddress, normalizeChainId } from './network.js';
import { registryProjectId, registryScannerVersion } from './preflight.js';

export const REPORT_PUBLISHED_SIGNATURE = 'ReportPublished(bytes32,bytes32,bytes32,uint16,string,string,address)';
export const REPORT_PUBLISHED_TOPIC = keccakHex(REPORT_PUBLISHED_SIGNATURE);

function receiptFail(field) { throw proofError('PROOF_RECEIPT_INVALID', { field }); }
function stripHex(value) { return String(value ?? '').replace(/^0x/iu, ''); }
function word(hex, index) { return hex.slice(index * 64, (index + 1) * 64); }

function decodeUint(hex, field) {
  if (!/^[0-9a-f]{64}$/u.test(hex)) receiptFail(field);
  const value = Number.parseInt(hex, 16);
  if (!Number.isSafeInteger(value)) receiptFail(field);
  return value;
}

function decodeString(data, offset, field) {
  if (!Number.isSafeInteger(offset) || offset < 128 || offset % 32 !== 0) receiptFail(field);
  const start = offset * 2;
  const length = decodeUint(data.slice(start, start + 64), field);
  if (length > 512) receiptFail(field);
  const body = data.slice(start + 64, start + 64 + length * 2);
  if (body.length !== length * 2 || !/^[0-9a-f]*$/u.test(body)) receiptFail(field);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(body.match(/../gu) ?? [], (byte) => Number.parseInt(byte, 16))); }
  catch { receiptFail(field); }
}

export function decodeReportPublishedLog(log) {
  const topics = log?.topics;
  if (!Array.isArray(topics) || topics.length !== 4 || String(topics[0]).toLowerCase() !== REPORT_PUBLISHED_TOPIC.toLowerCase()) receiptFail('topics');
  const data = stripHex(log.data).toLowerCase();
  if (!/^[0-9a-f]+$/u.test(data) || data.length < 256 || data.length > 16_384) receiptFail('data');
  const score = decodeUint(word(data, 0), 'score');
  if (score > 100) receiptFail('score');
  const scannerOffset = decodeUint(word(data, 1), 'scannerVersion');
  const uriOffset = decodeUint(word(data, 2), 'reportURI');
  const publisherWord = word(data, 3);
  if (!/^0{24}[0-9a-f]{40}$/u.test(publisherWord)) receiptFail('publisher');
  let publisher;
  try { publisher = checksumAddress(`0x${publisherWord.slice(24)}`, 'publisher'); } catch { receiptFail('publisher'); }
  return Object.freeze({
    projectId: requireBytes32(topics[1], 'projectId'),
    sourceHash: requireBytes32(topics[2], 'sourceHash'),
    reportHash: requireBytes32(topics[3], 'reportHash'),
    score,
    scannerVersion: decodeString(data, scannerOffset, 'scannerVersion'),
    reportURI: decodeString(data, uriOffset, 'reportURI'),
    publisher,
  });
}

export function verifyRegistryRecord(record, envelope, { publisher } = {}) {
  verifyV4ProofEnvelope(envelope);
  const normalized = Array.isArray(record) ? {
    sourceHash: record[0], reportHash: record[1], score: record[2], scannerVersion: record[3],
    reportURI: record[4], publisher: record[5], publishedAt: record[6],
  } : { ...record };
  const expected = {
    projectId: registryProjectId(envelope.projectId),
    sourceHash: digestToBytes32(envelope.sourceManifestDigest, 'sourceManifestDigest'),
    reportHash: digestToBytes32(envelope.reportHash, 'reportHash'),
    scannerVersion: registryScannerVersion(envelope),
  };
  if (normalized.projectId !== undefined && requireBytes32(normalized.projectId, 'projectId') !== expected.projectId) throw proofError('PROOF_DUPLICATE_CONFLICT');
  if (requireBytes32(normalized.sourceHash, 'sourceHash') !== expected.sourceHash
    || requireBytes32(normalized.reportHash, 'reportHash') !== expected.reportHash
    || Number(normalized.score) !== 0
    || normalized.scannerVersion !== expected.scannerVersion) throw proofError('PROOF_DUPLICATE_CONFLICT');
  if (publisher && checksumAddress(normalized.publisher, 'publisher').toLowerCase() !== checksumAddress(publisher, 'publisher').toLowerCase()) {
    throw proofError('PROOF_DUPLICATE_CONFLICT');
  }
  return true;
}

export function normalizeRegistryReceipt(receipt, envelope, context = {}) {
  verifyV4ProofEnvelope(envelope);
  const network = assertTrustedNetwork({
    networkKey: context.networkKey ?? envelope.networkKey,
    providerChainId: context.providerChainId ?? envelope.chainId,
    registryAddress: context.registryAddress ?? envelope.registryAddress,
  });
  if (!(receipt?.status === true || receipt?.status === 1 || receipt?.status === '0x1' || receipt?.status === '1')) receiptFail('status');
  const transactionHash = String(receipt.transactionHash ?? '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(transactionHash)) receiptFail('transactionHash');
  const blockNumber = normalizeChainId(receipt.blockNumber);
  let publisher;
  try { publisher = checksumAddress(context.publisher ?? receipt.from, 'publisher'); } catch { receiptFail('publisher'); }
  const log = (receipt.logs ?? []).find((candidate) => (
    String(candidate?.address ?? '').toLowerCase() === network.registryAddress.toLowerCase()
    && String(candidate?.topics?.[0] ?? '').toLowerCase() === REPORT_PUBLISHED_TOPIC.toLowerCase()
  ));
  if (!log) receiptFail('logs');
  const event = decodeReportPublishedLog(log);
  if (event.publisher.toLowerCase() !== publisher.toLowerCase()
    || event.projectId !== registryProjectId(envelope.projectId)
    || event.sourceHash !== digestToBytes32(envelope.sourceManifestDigest)
    || event.reportHash !== digestToBytes32(envelope.reportHash)
    || event.scannerVersion !== registryScannerVersion(envelope)) receiptFail('event');
  return Object.freeze({
    chainId: network.chainId,
    networkKey: network.networkKey,
    registryAddress: network.registryAddress,
    registryContractVersion: network.registryContractVersion,
    transactionHash,
    blockNumber,
    publisher,
    reportHash: envelope.reportHash,
    status: 'confirmed',
    explorerUrl: `${network.explorerBaseUrl}/tx/${transactionHash}`,
  });
}
