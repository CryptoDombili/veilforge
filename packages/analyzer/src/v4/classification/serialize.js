import { compare, plain, serializeCanonical } from './common.js';
export function normalizeClassification(result) {
  const value = plain(result); const sort = (key, id) => value[key].sort((a, b) => compare(a[id], b[id]));
  sort('sourceCandidates', 'sourceCandidateId'); sort('sinkCandidates', 'sinkCandidateId'); sort('candidateTraces', 'candidateTraceId');
  sort('declassificationDecisions', 'decisionId'); sort('acceptedRisks', 'acceptedRiskId'); sort('incomplete', 'incompleteId');
  for (const item of [...value.sourceCandidates, ...value.sinkCandidates, ...value.declassificationDecisions]) item.evidence?.sort((a, b) => compare(a.evidenceId, b.evidenceId));
  return value;
}
export function serializeClassification(result) { return serializeCanonical(normalizeClassification(result)); }
