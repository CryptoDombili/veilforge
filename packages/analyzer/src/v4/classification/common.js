import { canonicalJson, compareCodePoints, domainHash } from '../frontend/standard-json.js';

export const CLASSIFICATION_ID_DOMAIN = 'veilforge:v4:classification-id:1';
export const compare = compareCodePoints;

export function classificationId(kind, value) {
  return domainHash(CLASSIFICATION_ID_DOMAIN, { kind, value });
}

export function normalizeName(value) {
  return String(value ?? '').replace(/^\uFEFF/u, '').replace(/\\/gu, '/').replace(/([a-z0-9])([A-Z])/gu, '$1-$2')
    .toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
}

export function stable(items, key) { return [...items].sort((a, b) => compare(a[key], b[key])); }
export function serializeCanonical(value) { return canonicalJson(value); }
export function locationAnchor(location) {
  return location ? { sourcePath: String(location.sourcePath ?? '').replace(/\\/gu, '/'), byteStart: location.byteStart, byteEnd: location.byteEnd } : null;
}

export function plain(value) {
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  return value;
}
