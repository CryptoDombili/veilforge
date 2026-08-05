import { webV4Error } from './errors.js';

function encode(value, seen) {
  if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw webV4Error('WEB_V4_REPORT_INVALID', 'Value is not canonical JSON.');
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (seen.has(value)) throw webV4Error('WEB_V4_REPORT_INVALID', 'Circular data is not supported.');
  seen.add(value);
  const result = Array.isArray(value)
    ? `[${value.map((item) => encode(item, seen)).join(',')}]`
    : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${encode(value[key], seen)}`).join(',')}}`;
  seen.delete(value);
  return result;
}

export const canonicalJson = (value) => encode(value, new Set());
export const utf8Bytes = (value) => new TextEncoder().encode(typeof value === 'string' ? value : canonicalJson(value));
export const cloneValue = (value) => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));

export async function sha256Digest(value) {
  if (!globalThis.crypto?.subtle) throw webV4Error('WEB_V4_RUNTIME_UNAVAILABLE', 'Web Crypto is required.');
  const bytes = value instanceof Uint8Array ? value : utf8Bytes(value);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${[...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const item of Object.values(value)) deepFreeze(item, seen);
  if (!ArrayBuffer.isView(value)) Object.freeze(value);
  return value;
}
