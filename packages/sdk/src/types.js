/** @typedef {'completed'|'incomplete'|'failed'|'timed-out'|'aborted'} ScanStatus */
/** @typedef {'ignore'|'fail'} ProgressCallbackErrorMode */
/** @typedef {{content:string}} SourceInput */
/** @typedef {Readonly<Record<string, SourceInput|string>>} SourceMap */
/**
 * @typedef {object} ScanInput
 * @property {string} projectId
 * @property {string=} projectName
 * @property {SourceMap} sources
 * @property {{version:string}=} compiler
 * @property {object=} settings
 * @property {object=} policy
 * @property {string|object=} taxonomy
 * @property {string[]=} domains
 * @property {object=} budgets
 * @property {object=} metadata
 */
/**
 * @typedef {object} ScanOptions
 * @property {number=} stageTimeoutMs
 * @property {number=} globalTimeoutMs
 * @property {AbortSignal=} signal
 * @property {Function=} onProgress
 * @property {boolean=} includeOperationalMetadata
 * @property {boolean=} deterministic
 * @property {string[]=} domains
 * @property {object=} detectorRegistry
 * @property {object=} analysisBudgets
 * @property {boolean=} export
 * @property {boolean=} throwOnError
 * @property {ProgressCallbackErrorMode=} progressCallbackErrorMode
 */

export const SCAN_STATUSES = Object.freeze(['completed', 'incomplete', 'failed', 'timed-out', 'aborted']);

export function clonePublic(value, seen = new Map()) {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return new value.constructor(value);
  if (seen.has(value)) return seen.get(value);
  const clone = Array.isArray(value) ? [] : {};
  seen.set(value, clone);
  for (const [key, item] of Object.entries(value)) clone[key] = clonePublic(item, seen);
  return clone;
}

export function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const item of Object.values(value)) deepFreeze(item, seen);
  if (!ArrayBuffer.isView(value)) Object.freeze(value);
  return value;
}

export const immutablePublic = (value) => deepFreeze(clonePublic(value));
