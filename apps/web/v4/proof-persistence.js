import { canonicalJson, cloneValue, deepFreeze, sha256Digest, utf8Bytes } from './canonical.js';
import { webV4Error } from './errors.js';
import { verifyWebProofEnvelope } from './proof-adapter.js';
import { safeWebExplorerLink } from './proof-receipt.js';
import { WEB_PROOF_STATES } from './proof-lifecycle.js';

export const WEB_PROOF_STORAGE_PREFIX = 'veilforge:v4:web-proof:';
export const WEB_PROOF_PERSISTENCE_VERSION = 'veilforge.web-proof-state.v1';
const FORBIDDEN = new Set(['provider', 'signer', 'privateKey', 'seedPhrase', 'mnemonic', 'source', 'sourceCode', 'content', 'ast', 'ir', 'rawReceipt', 'rawError']);

function assertSafe(value, depth = 0, seen = new Set()) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value) || depth > 32) throw webV4Error('WEB_V4_PROOF_PERSISTENCE_FAILED', 'Proof state structure is unsafe.');
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN.has(key) || key.startsWith('__')) throw webV4Error('WEB_V4_PROOF_PERSISTENCE_FAILED', 'Proof state contains forbidden data.');
    assertSafe(child, depth + 1, seen);
  }
  seen.delete(value);
}

export function webProofStorageKey(envelope) {
  return `${WEB_PROOF_STORAGE_PREFIX}${envelope.chainId}:${envelope.registryAddress.toLowerCase()}:${envelope.reportHash}`;
}

function safePreflight(preflight) {
  if (!preflight) return null;
  return {
    status: preflight.status,
    checks: cloneValue(preflight.checks ?? []),
    blockingReasons: [...(preflight.blockingReasons ?? [])],
    warnings: [...(preflight.warnings ?? [])],
    transactionSummary: preflight.transactionSummary ? cloneValue(preflight.transactionSummary) : null,
  };
}

export async function saveWebProofState(storage, { envelope, preflight = null, status = 'ready', transactionHash = null, receiptSummary = null, updatedAt = new Date().toISOString() } = {}, options = {}) {
  await verifyWebProofEnvelope(envelope);
  if (!WEB_PROOF_STATES.includes(status)) throw webV4Error('WEB_V4_PROOF_PERSISTENCE_FAILED', 'Proof state status is invalid.');
  if (transactionHash !== null) safeWebExplorerLink(transactionHash, envelope.networkKey);
  const payload = {
    persistenceVersion: WEB_PROOF_PERSISTENCE_VERSION,
    envelope: cloneValue(envelope),
    preflight: safePreflight(preflight),
    status,
    transactionHash,
    receiptSummary: receiptSummary ? cloneValue(receiptSummary) : null,
    explorerUrl: transactionHash ? safeWebExplorerLink(transactionHash, envelope.networkKey) : null,
    updatedAt,
  };
  assertSafe(payload);
  const record = { ...payload, stateDigest: await sha256Digest(payload) };
  if (utf8Bytes(canonicalJson(record)).byteLength > (options.maxBytes ?? 256 * 1024)) throw webV4Error('WEB_V4_PROOF_PERSISTENCE_FAILED', 'Proof state exceeds the browser storage limit.');
  try { storage.setItem(webProofStorageKey(envelope), canonicalJson(record)); }
  catch { throw webV4Error('WEB_V4_PROOF_PERSISTENCE_FAILED', 'Proof state could not be persisted.'); }
  return deepFreeze(record);
}

export async function loadWebProofState(storage, key) {
  if (!String(key ?? '').startsWith(WEB_PROOF_STORAGE_PREFIX)) throw webV4Error('WEB_V4_PROOF_PERSISTENCE_FAILED', 'Proof state namespace is invalid.');
  let record;
  try { record = JSON.parse(storage.getItem(key) ?? 'null'); }
  catch { throw webV4Error('WEB_V4_PROOF_PERSISTENCE_FAILED', 'Stored proof state is corrupt.'); }
  if (!record || record.persistenceVersion !== WEB_PROOF_PERSISTENCE_VERSION) throw webV4Error('WEB_V4_PROOF_PERSISTENCE_FAILED', 'Stored proof state is incompatible.');
  assertSafe(record);
  const payload = cloneValue(record); delete payload.stateDigest;
  if (record.stateDigest !== await sha256Digest(payload)) throw webV4Error('WEB_V4_PROOF_PERSISTENCE_FAILED', 'Stored proof state was tampered with.');
  await verifyWebProofEnvelope(record.envelope);
  if (webProofStorageKey(record.envelope) !== key) throw webV4Error('WEB_V4_PROOF_PERSISTENCE_FAILED', 'Stored proof identity is invalid.');
  if (record.transactionHash && record.explorerUrl !== safeWebExplorerLink(record.transactionHash, record.envelope.networkKey)) throw webV4Error('WEB_V4_PROOF_PERSISTENCE_FAILED', 'Stored explorer identity is invalid.');
  return deepFreeze(record);
}
