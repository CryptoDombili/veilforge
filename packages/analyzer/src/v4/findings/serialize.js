import { canonicalJson, compareCodePoints } from '../frontend/standard-json.js';
import { plain } from '../classification/common.js';

export function normalizeFindingRun(run) {
  const value = plain(run); value.findings.sort((a, b) => compareCodePoints(a.findingId, b.findingId));
  for (const finding of value.findings) for (const key of ['relatedDetectorIds','semanticCategories','sourceLocations','sinkLocations','callableIds','contractIds','detectorResultIds','candidateTraceIds','sourceCandidateIds','sinkCandidateIds','orderedEvidence','groupedOccurrenceIds','incompleteReasons','declassificationDecisionIds','acceptedRiskIds','policyRuleIds']) {
    finding[key].sort((a, b) => compareCodePoints(typeof a === 'string' ? a : canonicalJson(a), typeof b === 'string' ? b : canonicalJson(b)));
  }
  return value;
}
export function serializeFindingRun(run) { return canonicalJson(normalizeFindingRun(run)); }
