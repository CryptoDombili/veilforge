import { deepFreeze } from './canonical.js';
import { webV4Error } from './errors.js';

const INTENT = /^0x[0-9a-f]{64}$/u;
const HASH = /^0x[0-9a-f]{64}$/u;
const PREFIX = 'veilforge:v4:proof-send-intent:v1:';
const LOCK_PREFIX = 'veilforge:v4:proof-send-lock:v1:';

export const PROOF_SEND_STATES = Object.freeze({
  PREPARED: 'PREPARED',
  WALLET_REQUEST_PENDING: 'WALLET_REQUEST_PENDING',
  PROVIDER_CALL_STARTED: 'PROVIDER_CALL_STARTED',
  TX_HASH_KNOWN: 'TX_HASH_KNOWN',
  RECONCILIATION_REQUIRED: 'RECONCILIATION_REQUIRED',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
});

const RECOVERABLE_BEFORE_PROVIDER = new Set([PROOF_SEND_STATES.PREPARED, PROOF_SEND_STATES.WALLET_REQUEST_PENDING]);
const STATES = new Set(Object.values(PROOF_SEND_STATES));
const LEGACY_STATE = Object.freeze({
  validating: PROOF_SEND_STATES.PREPARED,
  'wallet-request-pending': PROOF_SEND_STATES.RECONCILIATION_REQUIRED,
  pending: PROOF_SEND_STATES.TX_HASH_KNOWN,
  'reconciliation-required': PROOF_SEND_STATES.RECONCILIATION_REQUIRED,
});

function coordinationError(message) {
  return webV4Error('WEB_V4_RECONCILIATION_REQUIRED', message);
}

function randomOwnerId(cryptoProvider) {
  if (typeof cryptoProvider?.randomUUID === 'function') return cryptoProvider.randomUUID();
  if (typeof cryptoProvider?.getRandomValues === 'function') {
    const bytes = cryptoProvider.getRandomValues(new Uint8Array(16));
    return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  }
  throw coordinationError('Secure cross-context publication coordination is unavailable.');
}

function parseRecord(raw, intentId) {
  if (raw === null) return null;
  let stored;
  try { stored = JSON.parse(raw); } catch { throw coordinationError('Stored publication coordination state is corrupt.'); }
  const state = stored?.version === 1 ? LEGACY_STATE[stored.status] : stored?.state;
  const record = stored?.version === 1 ? { ...stored, version: 2, state } : { ...stored };
  delete record.status;
  if (!record || record.version !== 2 || record.intentId !== intentId
    || typeof record.ownerId !== 'string' || !Number.isSafeInteger(record.createdAt) || !Number.isSafeInteger(record.updatedAt)
    || !STATES.has(record.state)
    || (record.transactionHash !== null && !HASH.test(record.transactionHash))) {
    throw coordinationError('Stored publication coordination state is invalid.');
  }
  if (record.state === PROOF_SEND_STATES.TX_HASH_KNOWN && !HASH.test(record.transactionHash ?? '')) {
    throw coordinationError('Stored publication transaction identity is invalid.');
  }
  return record;
}

export function createProofSendCoordinator({ locks, storage, cryptoProvider = globalThis.crypto, now = () => Date.now(), leaseMs = 120_000, ownerId = null } = {}) {
  if (typeof locks?.request !== 'function' || typeof storage?.getItem !== 'function' || typeof storage?.setItem !== 'function' || typeof storage?.removeItem !== 'function') {
    throw coordinationError('Atomic cross-context publication coordination is unavailable.');
  }
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 30_000 || leaseMs > 300_000) throw coordinationError('Publication coordination lease is invalid.');
  const owner = ownerId ?? randomOwnerId(cryptoProvider);

  const underLock = async (intentId, callback) => {
    if (!INTENT.test(intentId)) throw coordinationError('Publication intent identity is invalid.');
    return locks.request(`${LOCK_PREFIX}${intentId}`, { mode: 'exclusive' }, callback);
  };
  const key = (intentId) => `${PREFIX}${intentId}`;
  const read = (intentId) => parseRecord(storage.getItem(key(intentId)), intentId);
  const write = (record) => {
    storage.setItem(key(record.intentId), JSON.stringify(record));
    return deepFreeze({ ...record });
  };
  const isStale = (record, timestamp) => timestamp - record.updatedAt > leaseMs;

  return Object.freeze({
    ownerId: owner,
    async claim(intentId) {
      return underLock(intentId, () => {
        const timestamp = now();
        const existing = read(intentId);
        if (existing) {
          if (existing.state === PROOF_SEND_STATES.PROVIDER_CALL_STARTED && isStale(existing, timestamp)) {
            const record = write({ ...existing, state: PROOF_SEND_STATES.RECONCILIATION_REQUIRED, updatedAt: timestamp });
            return deepFreeze({ acquired: false, record });
          }
          const recoverable = RECOVERABLE_BEFORE_PROVIDER.has(existing.state) && isStale(existing, timestamp);
          if (!recoverable) return deepFreeze({ acquired: false, record: deepFreeze({ ...existing }) });
        }
        const record = write({ version: 2, intentId, ownerId: owner, state: PROOF_SEND_STATES.PREPARED, transactionHash: null, createdAt: timestamp, updatedAt: timestamp });
        return deepFreeze({ acquired: true, record });
      });
    },
    async transition(intentId, state, transactionHash = null) {
      if (!STATES.has(state) || state === PROOF_SEND_STATES.PREPARED) throw coordinationError('Publication coordination transition is invalid.');
      return underLock(intentId, () => {
        const existing = read(intentId);
        if (!existing || existing.ownerId !== owner) throw coordinationError('Publication coordination ownership was lost.');
        const allowed = existing.state === PROOF_SEND_STATES.PREPARED && state === PROOF_SEND_STATES.WALLET_REQUEST_PENDING
          || existing.state === PROOF_SEND_STATES.WALLET_REQUEST_PENDING && [PROOF_SEND_STATES.PROVIDER_CALL_STARTED, PROOF_SEND_STATES.REJECTED].includes(state)
          || existing.state === PROOF_SEND_STATES.PROVIDER_CALL_STARTED && [PROOF_SEND_STATES.TX_HASH_KNOWN, PROOF_SEND_STATES.RECONCILIATION_REQUIRED, PROOF_SEND_STATES.REJECTED].includes(state)
          || existing.state === PROOF_SEND_STATES.RECONCILIATION_REQUIRED && [PROOF_SEND_STATES.TX_HASH_KNOWN, PROOF_SEND_STATES.CONFIRMED, PROOF_SEND_STATES.REJECTED].includes(state)
          || existing.state === PROOF_SEND_STATES.TX_HASH_KNOWN && [PROOF_SEND_STATES.CONFIRMED, PROOF_SEND_STATES.RECONCILIATION_REQUIRED].includes(state);
        if (!allowed) throw coordinationError('Publication coordination transition is not allowed.');
        const normalizedHash = transactionHash ? String(transactionHash).toLowerCase() : existing.transactionHash;
        if (state === PROOF_SEND_STATES.TX_HASH_KNOWN && !HASH.test(normalizedHash ?? '')) throw coordinationError('Publication transaction hash is invalid.');
        return write({ ...existing, state, transactionHash: normalizedHash ?? null, updatedAt: now() });
      });
    },
    async releaseBeforeRetry(intentId, { walletRejected = false, providerInvoked = false } = {}) {
      return underLock(intentId, () => {
        const existing = read(intentId);
        if (!existing || existing.ownerId !== owner) return false;
        const safeBeforeProvider = RECOVERABLE_BEFORE_PROVIDER.has(existing.state) && !providerInvoked;
        const explicitRejection = walletRejected && [PROOF_SEND_STATES.PROVIDER_CALL_STARTED, PROOF_SEND_STATES.REJECTED].includes(existing.state);
        if (!safeBeforeProvider && !explicitRejection) throw coordinationError('A publication attempt that may have reached the wallet cannot be released automatically.');
        storage.removeItem(key(intentId));
        return true;
      });
    },
    async recoverPreProvider(intentId) {
      return underLock(intentId, () => {
        const existing = read(intentId);
        if (!existing || !RECOVERABLE_BEFORE_PROVIDER.has(existing.state) || !isStale(existing, now())) return false;
        storage.removeItem(key(intentId));
        return true;
      });
    },
    async recoverAfterReload(intentId) {
      return underLock(intentId, () => {
        const timestamp = now();
        const existing = read(intentId);
        if (!existing) return deepFreeze({ action: 'none', record: null });
        if (existing.state === PROOF_SEND_STATES.REJECTED
          || (RECOVERABLE_BEFORE_PROVIDER.has(existing.state) && isStale(existing, timestamp))) {
          storage.removeItem(key(intentId));
          return deepFreeze({ action: 'retryable', record: null });
        }
        if (existing.state === PROOF_SEND_STATES.PROVIDER_CALL_STARTED) {
          const record = write({ ...existing, state: PROOF_SEND_STATES.RECONCILIATION_REQUIRED, updatedAt: timestamp });
          return deepFreeze({ action: 'reconciliation-required', record });
        }
        if (existing.state === PROOF_SEND_STATES.TX_HASH_KNOWN) {
          return deepFreeze({ action: 'reconcile-known-transaction', record: deepFreeze({ ...existing }) });
        }
        if (existing.state === PROOF_SEND_STATES.RECONCILIATION_REQUIRED) {
          return deepFreeze({ action: 'reconciliation-required', record: deepFreeze({ ...existing }) });
        }
        if (existing.state === PROOF_SEND_STATES.CONFIRMED) {
          return deepFreeze({ action: 'confirmed', record: deepFreeze({ ...existing }) });
        }
        return deepFreeze({ action: 'in-flight', record: deepFreeze({ ...existing }) });
      });
    },
    async confirm(intentId, transactionHash) {
      const hash = String(transactionHash ?? '').toLowerCase();
      if (!HASH.test(hash)) throw coordinationError('Publication transaction hash is invalid.');
      return underLock(intentId, () => {
        const existing = read(intentId);
        if (!existing || ![PROOF_SEND_STATES.TX_HASH_KNOWN, PROOF_SEND_STATES.RECONCILIATION_REQUIRED].includes(existing.state)) {
          throw coordinationError('Publication coordination cannot be confirmed from its current state.');
        }
        if (existing.transactionHash && existing.transactionHash !== hash) throw coordinationError('Confirmed publication transaction does not match the coordinated transaction.');
        return write({ ...existing, state: PROOF_SEND_STATES.CONFIRMED, transactionHash: hash, updatedAt: now() });
      });
    },
    async inspect(intentId) {
      return underLock(intentId, () => {
        const record = read(intentId);
        return record ? deepFreeze({ ...record }) : null;
      });
    },
  });
}

export function createBrowserProofSendCoordinator(options = {}) {
  return createProofSendCoordinator({
    locks: options.locks ?? globalThis.navigator?.locks,
    storage: options.storage ?? globalThis.localStorage,
    cryptoProvider: options.cryptoProvider ?? globalThis.crypto,
    now: options.now,
    leaseMs: options.leaseMs,
    ownerId: options.ownerId,
  });
}

export const WEB_PROOF_SEND_COORDINATION_PREFIX = PREFIX;
