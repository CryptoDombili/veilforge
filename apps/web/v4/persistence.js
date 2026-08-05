import { canonicalJson, cloneValue, deepFreeze, utf8Bytes } from './canonical.js';
import { webV4Error } from './errors.js';
import { verifyV4Report } from './report-adapter.js';
import { normalizeWebV4Limits } from './runtime/limits.js';
import { V4_PERSISTENCE_ENVELOPE_VERSION, V4_REPORT_VERSION, WEB_V4_FOUNDATION_VERSION } from './version.js';

export const V4_STORAGE_PREFIX = 'veilforge:v4:report:';
export const V3_STORAGE_PREFIX = 'veilforge:v3.2:';

const keyFor = (projectId) => `${V4_STORAGE_PREFIX}${encodeURIComponent(projectId)}`;

export async function saveV4Report(storage, verification, options = {}) {
  if (verification?.verified !== true) throw webV4Error('WEB_V4_REPORT_UNVERIFIED', 'Unverified reports cannot be persisted.');
  const projectId = verification.report.project?.projectId;
  if (!projectId) throw webV4Error('WEB_V4_PERSISTENCE_INVALID', 'V4 report projectId is required.');
  const envelope = {
    envelopeVersion: V4_PERSISTENCE_ENVELOPE_VERSION,
    productVersion: WEB_V4_FOUNDATION_VERSION,
    reportSchemaVersion: V4_REPORT_VERSION,
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
    projectId,
    reportHash: verification.reportHash,
    verified: true,
    report: cloneValue(verification.report),
    viewModel: options.viewModel ? cloneValue(options.viewModel) : null,
  };
  const text = canonicalJson(envelope);
  const limits = normalizeWebV4Limits(options.limits);
  if (utf8Bytes(text).byteLength > limits.maxPersistenceBytes) throw webV4Error('WEB_V4_PERSISTENCE_LIMIT', 'V4 persistence envelope exceeds the safe limit.');
  try { storage.setItem(keyFor(projectId), text); }
  catch { throw webV4Error('WEB_V4_STORAGE_QUOTA', 'V4 report could not be saved in browser storage.'); }
  return deepFreeze(envelope);
}

export async function loadV4Report(storage, projectId, options = {}) {
  let envelope;
  try { envelope = JSON.parse(storage.getItem(keyFor(projectId)) ?? 'null'); }
  catch { throw webV4Error('WEB_V4_PERSISTENCE_INVALID', 'Stored V4 envelope is corrupt.'); }
  const limits = normalizeWebV4Limits(options.limits);
  if (!envelope || utf8Bytes(canonicalJson(envelope)).byteLength > limits.maxPersistenceBytes) throw webV4Error('WEB_V4_PERSISTENCE_INVALID', 'Stored V4 envelope is missing or oversized.');
  if (envelope.envelopeVersion !== V4_PERSISTENCE_ENVELOPE_VERSION || envelope.reportSchemaVersion !== V4_REPORT_VERSION || envelope.projectId !== projectId || envelope.verified !== true) throw webV4Error('WEB_V4_PERSISTENCE_INVALID', 'Stored V4 envelope version is unsupported.');
  const verification = await verifyV4Report(envelope.report);
  if (verification.reportHash !== envelope.reportHash) throw webV4Error('WEB_V4_PERSISTENCE_INVALID', 'Stored V4 report hash does not match its envelope.');
  return deepFreeze({ envelope, verification });
}

export async function listV4Reports(storage, options = {}) {
  const entries = [];
  const errors = [];
  let keys;
  try { keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)); }
  catch { return deepFreeze({ entries, errors: [{ key: null, code: 'WEB_V4_STORAGE_QUOTA' }] }); }
  for (const key of keys) {
    if (!key?.startsWith(V4_STORAGE_PREFIX)) continue;
    let projectId;
    try { projectId = decodeURIComponent(key.slice(V4_STORAGE_PREFIX.length)); }
    catch { errors.push(Object.freeze({ key, code: 'WEB_V4_PERSISTENCE_INVALID' })); continue; }
    try {
      const loaded = await loadV4Report(storage, projectId, options);
      entries.push(Object.freeze({ projectId, createdAt: loaded.envelope.createdAt, reportHash: loaded.verification.reportHash, verification: loaded.verification }));
    } catch (error) { errors.push(Object.freeze({ key, code: error?.code ?? 'WEB_V4_PERSISTENCE_INVALID' })); }
  }
  entries.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.projectId.localeCompare(right.projectId));
  return deepFreeze({ entries, errors });
}

export function removeV4Report(storage, projectId) {
  try { storage.removeItem(keyFor(projectId)); }
  catch { throw webV4Error('WEB_V4_STORAGE_QUOTA', 'V4 browser storage is unavailable.'); }
}

export function clearV4Reports(storage) {
  let keys;
  try { keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key) => key?.startsWith(V4_STORAGE_PREFIX)); }
  catch { throw webV4Error('WEB_V4_STORAGE_QUOTA', 'V4 browser storage is unavailable.'); }
  try { for (const key of keys) storage.removeItem(key); }
  catch { throw webV4Error('WEB_V4_STORAGE_QUOTA', 'V4 browser storage is unavailable.'); }
  return keys.length;
}

export function readV3Storage(storage, key = `${V3_STORAGE_PREFIX}scan-history`) {
  if (!key.startsWith(V3_STORAGE_PREFIX)) throw webV4Error('WEB_V4_PERSISTENCE_INVALID', 'Only V3 read-only keys are accepted.');
  try { return deepFreeze(cloneValue(JSON.parse(storage.getItem(key) ?? '[]'))); }
  catch { return Object.freeze([]); }
}
