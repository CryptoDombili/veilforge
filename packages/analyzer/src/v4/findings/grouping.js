import { compare } from '../classification/common.js';
import { findingCategory } from './severity.js';

const SEMANTIC = new Set(['terms-disclosure', 'approval-disclosure', 'collateral-disclosure']);
function occurrenceSignature(result) { return [result.domain, result.dataClass, result.sinkClass, result.sourceCandidateId, result.sinkCandidateId, result.candidateTraceId, result.contractId, result.callableId, result.disposition, result.acceptedRiskId, result.declassificationDecisionId, result.complete].join('|'); }
function groupingSignature(result, category) {
  if (category === 'event-disclosure' && result.semanticSinkKey) return [result.domain, category, result.dataClass, result.sinkClass,
    result.contractId, result.disposition, result.acceptedRiskId, result.policyRuleId, result.semanticSinkKey, result.complete].join('|');
  return `${category}|${occurrenceSignature(result)}`;
}

export function groupDetectorResults(results) {
  const sorted = [...results].sort((a, b) => compare(a.detectorResultId, b.detectorResultId));
  const categoriesByOccurrence = new Map();
  for (const result of sorted) { const key = occurrenceSignature(result); const category = findingCategory(result.detectorId); if (!SEMANTIC.has(category)) { const values = categoriesByOccurrence.get(key) ?? []; values.push(category); categoriesByOccurrence.set(key, values); } }
  const groups = new Map();
  for (const result of sorted) {
    const occurrence = occurrenceSignature(result); const category = findingCategory(result.detectorId);
    const primaryCategory = SEMANTIC.has(category) && categoriesByOccurrence.get(occurrence)?.length ? [...categoriesByOccurrence.get(occurrence)].sort(compare)[0] : category;
    const key = groupingSignature(result, primaryCategory); const group = groups.get(key) ?? { category: primaryCategory, results: [], semanticCategories: new Set() };
    group.results.push(result); if (SEMANTIC.has(category)) group.semanticCategories.add(category); groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({ ...group, semanticCategories: [...group.semanticCategories].sort(compare) })).sort((a, b) => compare(a.results[0].detectorResultId, b.results[0].detectorResultId));
}
