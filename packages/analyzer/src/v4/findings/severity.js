const HIGH_SENSITIVITY = new Set(['customer-kyc-reference', 'payer', 'payee', 'beneficiary', 'supplier', 'employee-payroll', 'treasury-operator', 'collateral']);
const UNKNOWN_BOUNDARIES = new Set(['unresolved-call', 'unresolved-external-call', 'low-level-call', 'delegatecall', 'delegatecall-boundary', 'dynamic-function-pointer', 'unknown-metadata-builder']);

export const SEVERITY_LEVELS = Object.freeze(['critical', 'high', 'medium', 'low', 'informational', 'unknown']);

export function findingCategory(detectorId = '') {
  const id = String(detectorId);
  if (id.includes('calldata-observation')) return 'calldata-observation';
  if (id.includes('public-storage')) return 'public-storage-disclosure';
  if (id.includes('public-getter')) return 'public-getter-disclosure';
  if (id.includes('external-call')) return 'external-call-disclosure';
  if (id.includes('metadata')) return 'metadata-disclosure';
  if (id.includes('event')) return 'event-disclosure';
  if (id.includes('return')) return 'return-disclosure';
  if (id.includes('revert')) return 'revert-disclosure';
  if (id.includes('approval')) return 'approval-disclosure';
  if (id.includes('terms')) return 'terms-disclosure';
  if (id.includes('collateral')) return 'collateral-disclosure';
  return 'financial-data-disclosure';
}

export function calculateSeverity({ category, dataClass, disposition, complete, incompleteReasons = [], confidence }) {
  if (category === 'calldata-observation') return 'informational';
  if (!complete && incompleteReasons.some((reason) => UNKNOWN_BOUNDARIES.has(reason))) return 'unknown';
  const sensitive = HIGH_SENSITIVITY.has(dataClass);
  let severity = 'medium';
  if (category === 'revert-disclosure') severity = sensitive ? 'medium' : 'low';
  else if (['event-disclosure', 'public-storage-disclosure', 'public-getter-disclosure', 'return-disclosure', 'external-call-disclosure', 'metadata-disclosure'].includes(category)) severity = sensitive ? 'high' : 'medium';
  else if (['terms-disclosure', 'approval-disclosure', 'collateral-disclosure'].includes(category)) severity = sensitive ? 'high' : 'medium';
  if (complete && disposition === 'detected' && confidence === 'high' && dataClass === 'customer-kyc-reference' && ['event-disclosure', 'public-storage-disclosure', 'public-getter-disclosure'].includes(category)) return 'critical';
  return severity;
}
