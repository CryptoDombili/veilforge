export function summarizeClassification(result) {
  const count = (items, key) => Object.fromEntries([...new Set(items.map((item) => item[key]))].sort().map((value) => [value, items.filter((item) => item[key] === value).length]));
  return { sources: result.sourceCandidates.length, sourcesByClass: count(result.sourceCandidates, 'dataClass'), sinks: result.sinkCandidates.length,
    sinksByClass: count(result.sinkCandidates, 'sinkClass'), traces: result.candidateTraces.length, decisions: result.declassificationDecisions.length,
    decisionsByStatus: count(result.declassificationDecisions, 'decision'), acceptedRisks: result.acceptedRisks.length,
    validAcceptedRisks: result.acceptedRisks.filter((item) => item.valid).length, incomplete: result.incomplete.length, policyValid: result.policy.valid };
}
