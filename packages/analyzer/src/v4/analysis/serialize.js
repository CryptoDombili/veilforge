import { canonicalJson, compareCodePoints } from '../frontend/standard-json.js';

function plain(value) {
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  return value;
}

export function normalizeDataflowAnalysis(analysis) {
  const normalized = plain(analysis);
  normalized.callables.sort((a, b) => compareCodePoints(a.callableId, b.callableId));
  for (const callable of normalized.callables) {
    callable.facts.sort((a, b) => compareCodePoints(a.factId, b.factId));
    callable.valueNodes.sort((a, b) => compareCodePoints(a.valueNodeId, b.valueNodeId));
    callable.valueFlowEdges.sort((a, b) => compareCodePoints(a.edgeId, b.edgeId));
    callable.traces.sort((a, b) => compareCodePoints(a.traceId, b.traceId));
    callable.incomplete.sort((a, b) => compareCodePoints(a.incompleteId, b.incompleteId));
  }
  return normalized;
}

export function serializeDataflowAnalysis(analysis) {
  return canonicalJson(normalizeDataflowAnalysis(analysis));
}

export function normalizeProgramAnalysis(analysis) {
  const normalized = plain(analysis);
  normalized.callableAnalyses.sort((a, b) => compareCodePoints(a.callableId, b.callableId));
  for (const callable of normalized.callableAnalyses) {
    callable.facts.sort((a, b) => compareCodePoints(a.factId, b.factId));
    callable.valueNodes.sort((a, b) => compareCodePoints(a.valueNodeId, b.valueNodeId));
    callable.valueFlowEdges.sort((a, b) => compareCodePoints(a.edgeId, b.edgeId));
    callable.traces.sort((a, b) => compareCodePoints(a.traceId, b.traceId));
    callable.incomplete.sort((a, b) => compareCodePoints(a.incompleteId, b.incompleteId));
  }
  normalized.callSummaries.sort((a, b) => compareCodePoints(a.summaryId, b.summaryId));
  normalized.callBoundaries.sort((a, b) => compareCodePoints(a.boundaryId, b.boundaryId));
  normalized.interproceduralEdges.sort((a, b) => compareCodePoints(a.edgeId, b.edgeId));
  normalized.traces.sort((a, b) => compareCodePoints(a.traceId, b.traceId));
  normalized.incomplete.sort((a, b) => compareCodePoints(a.incompleteId, b.incompleteId));
  return normalized;
}

export function serializeProgramAnalysis(analysis) {
  return canonicalJson(normalizeProgramAnalysis(analysis));
}
