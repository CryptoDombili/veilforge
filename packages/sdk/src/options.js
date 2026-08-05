import { sdkError } from './errors.js';

const KEYS = new Set(['stageTimeoutMs', 'globalTimeoutMs', 'signal', 'onProgress', 'includeOperationalMetadata', 'deterministic', 'domains', 'detectorRegistry', 'analysisBudgets', 'export', 'throwOnError', 'progressCallbackErrorMode']);
export const SAFE_DEFAULTS = Object.freeze({
  stageTimeoutMs: 120_000,
  globalTimeoutMs: 300_000,
  includeOperationalMetadata: false,
  deterministic: true,
  export: true,
  throwOnError: true,
  progressCallbackErrorMode: 'ignore',
});

function invalid() { throw sdkError('SDK_OPTION_INVALID'); }
export function normalizeSdkOptions(options = {}, defaults = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) invalid();
  if (Object.keys(options).some((key) => !KEYS.has(key))) invalid();
  const merged = { ...SAFE_DEFAULTS, ...defaults, ...options };
  for (const name of ['stageTimeoutMs', 'globalTimeoutMs']) if (!Number.isInteger(merged[name]) || merged[name] <= 0) invalid();
  for (const name of ['includeOperationalMetadata', 'deterministic', 'export', 'throwOnError']) if (typeof merged[name] !== 'boolean') invalid();
  if (merged.onProgress !== undefined && typeof merged.onProgress !== 'function') invalid();
  if (merged.signal !== undefined && (typeof merged.signal !== 'object' || typeof merged.signal.addEventListener !== 'function')) invalid();
  if (!['ignore', 'fail'].includes(merged.progressCallbackErrorMode)) invalid();
  if (merged.domains !== undefined && (!Array.isArray(merged.domains) || !merged.domains.every((item) => typeof item === 'string'))) invalid();
  if (merged.detectorRegistry !== undefined && merged.detectorRegistry !== null) invalid();
  if (merged.analysisBudgets !== undefined && (!merged.analysisBudgets || typeof merged.analysisBudgets !== 'object' || Array.isArray(merged.analysisBudgets))) invalid();
  return merged;
}

export function toOrchestrationOptions(options, progressAdapter, stageBudgets) {
  return {
    stageTimeoutMs: options.stageTimeoutMs,
    globalTimeoutMs: options.globalTimeoutMs,
    signal: options.signal,
    onProgress: progressAdapter,
    includeOperational: options.includeOperationalMetadata,
    analysisOptions: options.analysisBudgets ? structuredClone(options.analysisBudgets) : undefined,
    stageBudgets,
  };
}
