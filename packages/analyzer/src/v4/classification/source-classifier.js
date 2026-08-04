import { classificationId, compare, locationAnchor, normalizeName } from './common.js';
import { CONFIDENCE } from './confidence.js';
import { createEvidence, sortEvidence } from './evidence.js';
import { SourceCandidate } from './source-model.js';

const aliases = new Map(Object.entries({
  payer: ['payer'], payee: ['payee'], beneficiary: ['beneficiary', 'destination', 'recipient'], supplier: ['supplier', 'vendor'],
  'employee-payroll': ['employee', 'payroll', 'salary', 'employee-payroll'],
  'customer-kyc-reference': ['kyc', 'kyc-reference', 'customer-reference', 'customer-kyc-reference'],
  amount: ['amount', 'payment-amount', 'invoice-amount', 'withdrawal-amount', 'transfer-amount', 'treasury-balance', 'spending-limit', 'allowance'], 'loan-terms': ['loan', 'loan-amount', 'principal', 'loan-terms'],
  'interest-rate': ['interest-rate', 'apr'], collateral: ['collateral'], 'invoice-reference': ['invoice', 'invoice-id', 'invoice-reference'],
  'settlement-reference': ['settlement', 'settlement-id', 'settlement-reference', 'approval-reference', 'execution-reference'], 'repayment-reference': ['repayment', 'repayment-id', 'repayment-reference'],
  'treasury-operator': ['treasury-operator', 'operator', 'signer', 'signer-identity', 'approver', 'approver-identity'],
  borrower: ['borrower'], customer: ['customer'],
}).flatMap(([dataClass, values]) => values.map((value) => [normalizeName(value), dataClass])));
const financialContext = /(?:payment|payroll|treasury|credit|loan|invoice|settlement|repayment|kyc|beneficiar|supplier|borrow)/u;

function contractFor(program, declaration) { return program.contracts.find((item) => item.canonicalName === declaration.contractContext) ?? null; }
function callableFor(program, declaration) {
  if (['function', 'modifier'].includes(declaration.kind)) return declaration;
  return program.declarations.find((item) => item.id === declaration.parentId && ['function', 'modifier'].includes(item.kind)) ?? null;
}
function matchesTarget(label, declaration) { return [declaration.id, declaration.symbolId, declaration.name, declaration.canonicalName].includes(label.target); }

export function classifySources(program, analysis, taxonomy, policyState) {
  const domain = policyState.valid ? policyState.policy.domain : null;
  const allowed = new Set(domain ? taxonomy.domains[domain]?.sensitiveClasses ?? [] : Object.values(taxonomy.domains).flatMap((item) => item.sensitiveClasses));
  const nodesBySymbol = new Map();
  for (const node of analysis.callableAnalyses.flatMap((item) => item.valueNodes)) if (node.symbolId) nodesBySymbol.set(node.symbolId, [...(nodesBySymbol.get(node.symbolId) ?? []), node]);
  const candidates = [];
  for (const declaration of [...program.declarations].sort((a, b) => compare(a.id, b.id))) {
    if (!['state-variable', 'parameter', 'return-parameter', 'local-variable'].includes(declaration.kind) || !declaration.symbolId) continue;
    const callable = callableFor(program, declaration); const contract = contractFor(program, declaration);
    const label = policyState.valid ? (policyState.policy.sourceLabels ?? []).find((item) => matchesTarget(item, declaration)) : null;
    const exactName = normalizeName(declaration.name); const directClass = label?.dataClass ?? aliases.get(exactName) ?? null;
    const tokenClasses = [...new Set([...aliases].filter(([alias]) => alias.length >= 4 && exactName.includes(alias)).map(([, value]) => value))];
    const context = normalizeName(`${contract?.name ?? ''}-${callable?.name ?? ''}-${callable?.canonicalName ?? ''}`);
    let dataClass = normalizeName(directClass); let confidence = CONFIDENCE.LOW; let origin = 'identifier-name'; let reason = 'name-only-supporting-signal';
    const evidence = [];
    if (label) { confidence = CONFIDENCE.HIGH; origin = 'policy-explicit-label'; reason = 'authoritative-policy-label'; evidence.push(createEvidence({ kind: 'policy-label', origin: label.id, detail: `${label.target}:${label.dataClass}`, location: declaration.location, strength: 'authoritative' })); }
    else if (directClass && allowed.has(directClass)) {
      const roleOnly = ['operator', 'signer', 'signer-identity', 'approver', 'approver-identity'].includes(exactName);
      confidence = roleOnly && !financialContext.test(context) ? CONFIDENCE.LOW
        : financialContext.test(context) || declaration.kind === 'state-variable' || declaration.kind === 'parameter' ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM;
      origin = 'taxonomy-alias'; reason = 'taxonomy-exact-alias'; evidence.push(createEvidence({ kind: 'taxonomy-alias', origin: domain ?? 'all-domains', detail: `${exactName}:${directClass}`, location: declaration.location, strength: 'primary' }));
    } else if (tokenClasses.length === 1 && allowed.has(tokenClasses[0])) {
      dataClass = tokenClasses[0]; confidence = CONFIDENCE.LOW; evidence.push(createEvidence({ kind: 'identifier-heuristic', origin: 'name-token', detail: exactName, location: declaration.location }));
    } else if (tokenClasses.length > 1) { continue; } else continue;
    if (!allowed.has(dataClass) && !label) continue;
    if (financialContext.test(context)) evidence.push(createEvidence({ kind: 'financial-context', origin: 'contract-callable-context', detail: context, location: callable?.location ?? contract?.location, strength: 'supporting' }));
    evidence.push(createEvidence({ kind: 'provenance', origin: 'core-ir', detail: declaration.kind, location: declaration.location }));
    const nodes = (nodesBySymbol.get(declaration.symbolId) ?? []).sort((a, b) => compare(a.valueNodeId, b.valueNodeId));
    const occurrences = nodes.length ? nodes : [{ valueNodeId: classificationId('declaration-value', { declarationId: declaration.id }), callableId: callable?.id ?? null, location: declaration.location }];
    for (const node of occurrences) {
      const fields = { dataClass, domain, symbolId: declaration.symbolId, valueNodeId: node.valueNodeId, callableId: node.callableId ?? callable?.id ?? null,
        contractId: contract?.id ?? null, location: locationAnchor(node.location ?? declaration.location), evidence: sortEvidence(evidence), confidence,
        classificationOrigin: origin, policyLabel: label?.id ?? null, complete: true, reason };
      candidates.push(new SourceCandidate({ ...fields, sourceCandidateId: classificationId('source-candidate', { dataClass, symbolId: declaration.symbolId, valueNodeId: node.valueNodeId, origin }) }));
    }
  }
  return candidates.sort((a, b) => compare(a.sourceCandidateId, b.sourceCandidateId));
}
