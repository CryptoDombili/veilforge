const RANK = new Map([['unknown', 0], ['low', 1], ['medium', 2], ['high', 3]]);
const UNKNOWN_REASONS = new Set(['unresolved-call', 'unresolved-external-call', 'delegatecall', 'delegatecall-boundary', 'low-level-call', 'invalid-policy', 'policy-invalid']);
const LOW_REASONS = new Set(['dynamic-storage-alias-not-modeled', 'dynamic-function-pointer', 'unknown-metadata-builder', 'ambiguous-approval', 'ambiguous-borrower-relationship', 'ambiguous-interest-rate-scope', 'ambiguous-collateral-relationship', 'classification-incomplete']);

export const CONFIDENCE_LEVELS = Object.freeze(['high', 'medium', 'low', 'unknown']);

export function calculateConfidence(results, incompleteReasons = []) {
  if (incompleteReasons.some((reason) => UNKNOWN_REASONS.has(reason))) return 'unknown';
  if (incompleteReasons.some((reason) => LOW_REASONS.has(reason))) return 'low';
  let value = 'high';
  for (const result of results) if ((RANK.get(result.confidence) ?? 0) < (RANK.get(value) ?? 0)) value = result.confidence ?? 'unknown';
  if (incompleteReasons.length && value === 'high') return 'medium';
  return CONFIDENCE_LEVELS.includes(value) ? value : 'unknown';
}
