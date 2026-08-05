export const WEB_V4_LIMITS = Object.freeze({
  maxFileCount: 100,
  maxPerFileBytes: 512 * 1024,
  maxProjectBytes: 5 * 1024 * 1024,
  maxWorkerProjectBytes: 5 * 1024 * 1024,
  maxPersistenceBytes: 2 * 1024 * 1024,
  stageTimeoutMs: 120_000,
  globalTimeoutMs: 300_000,
  abortGraceMs: 1_000,
});

export function normalizeWebV4Limits(value = {}) {
  const result = { ...WEB_V4_LIMITS };
  for (const key of Object.keys(value)) {
    if (!(key in result) || !Number.isInteger(value[key]) || value[key] <= 0 || value[key] > WEB_V4_LIMITS[key]) throw new TypeError(`Invalid browser limit: ${key}`);
    result[key] = value[key];
  }
  if (result.maxProjectBytes > result.maxWorkerProjectBytes) result.maxProjectBytes = result.maxWorkerProjectBytes;
  return Object.freeze(result);
}
