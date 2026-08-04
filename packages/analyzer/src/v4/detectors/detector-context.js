import { ClassificationInputError } from '../classification/errors.js';

const PAYMENTS_CLASSES = new Set([
  'payer', 'payee', 'beneficiary', 'supplier', 'employee-payroll', 'amount', 'payment-amount',
  'invoice-reference', 'settlement-reference', 'repayment-reference', 'customer-kyc-reference',
]);
const TREASURY_CLASSES = new Set(['treasury-operator', 'beneficiary', 'supplier', 'employee-payroll', 'amount', 'invoice-reference', 'settlement-reference']);
const PRIVATE_CREDIT_CLASSES = new Set(['customer-kyc-reference', 'beneficiary', 'loan-terms', 'collateral', 'interest-rate', 'settlement-reference']);
const DOMAIN_CLASSES = new Map([['arc-payments', PAYMENTS_CLASSES], ['arc-treasury', TREASURY_CLASSES], ['arc-private-credit', PRIVATE_CREDIT_CLASSES]]);
const GLOBAL_INCOMPLETE = new Set([
  'policy-invalid', 'trace-budget-exceeded', 'inline-assembly-not-modeled', 'dynamic-storage-alias-not-modeled',
  'dynamic-function-pointer', 'delegatecall-boundary', 'unsupported-expression', 'unknown-metadata-builder',
]);

export function createDetectorContext(classification, options = {}) {
  if (!classification?.candidateTraces || !classification?.sourceCandidates || !classification?.sinkCandidates) {
    throw new ClassificationInputError('Detector runner requires a Phase 3B-1 classification result.');
  }
  const program = options.program ?? null;
  const declarations = new Map((program?.declarations ?? []).map((item) => [item.id, item]));
  const symbols = new Map((program?.declarations ?? []).filter((item) => item.symbolId).map((item) => [item.symbolId, item]));
  const sourceById = new Map(classification.sourceCandidates.map((item) => [item.sourceCandidateId, item]));
  const sinkById = new Map(classification.sinkCandidates.map((item) => [item.sinkCandidateId, item]));
  const decisionByTrace = new Map(classification.declassificationDecisions.map((item) => [item.candidateTraceId, item]));
  const riskById = new Map(classification.acceptedRisks.map((item) => [item.id, item]));
  const globalIncomplete = classification.incomplete.filter((item) => GLOBAL_INCOMPLETE.has(item.reason)).map((item) => item.reason).sort();
  const domain = options.domain ?? 'arc-payments'; const supportedClasses = options.supportedClasses ?? DOMAIN_CLASSES.get(domain) ?? new Set();
  return {
    classification, program, declarations, symbols, sourceById, sinkById, decisionByTrace, riskById, globalIncomplete,
    domain, supportedClasses,
    isDomainSource(source) {
      if (!((source?.domain === domain || (!classification.policy.valid && source?.domain == null)) && supportedClasses.has(source.dataClass))) return false;
      if (domain !== 'arc-private-credit') return true;
      const hasContext = source.evidence.some((item) => item.kind === 'financial-context' || item.kind === 'policy-label');
      if (source.dataClass === 'interest-rate' && !hasContext) return false;
      if (source.dataClass === 'customer-kyc-reference' && source.confidence === 'low' && !hasContext) return false;
      return true;
    },
    isPaymentsSource(source) { return (source?.domain === 'arc-payments' || (!classification.policy.valid && source?.domain == null)) && PAYMENTS_CLASSES.has(source.dataClass); },
    sourceDeclaration(source) { return symbols.get(source?.symbolId) ?? null; },
    callable(callableId) { return declarations.get(callableId) ?? null; },
    acceptedRisk(decision) { return decision?.reason === 'valid-accepted-risk-disposition' ? riskById.get(decision.policyRuleId) ?? null : null; },
  };
}

export { DOMAIN_CLASSES, PAYMENTS_CLASSES, PRIVATE_CREDIT_CLASSES, TREASURY_CLASSES };
