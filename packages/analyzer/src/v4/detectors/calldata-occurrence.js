import { classificationId, compare } from '../classification/common.js';

const DISCLOSURE_SINKS = new Set(['event', 'external-call', 'metadata-uri', 'public-getter', 'public-storage', 'return', 'revert-custom-error']);
const DERIVED_PROVENANCE = /^(?:binary:|unary:|conditional:|builtin:|hash:)/u;

function keyFor(detector, source, decision) {
  return JSON.stringify([detector.detectorId, source.symbolId ?? source.sourceCandidateId, source.callableId, source.contractId, source.dataClass,
    decision?.reason ?? null, decision?.policyRuleId ?? null]);
}
function locationStart(value) { return value?.location?.byteStart ?? value?.location?.startByte ?? Number.MAX_SAFE_INTEGER; }
function hasContext(source) { return source.evidence.some((item) => item.kind === 'financial-context' || item.kind === 'policy-label' || item.kind === 'taxonomy-alias'); }
function isDerived(trace, context) {
  return trace.orderedValueNodeIds.slice(1, -1).some((id) => DERIVED_PROVENANCE.test(String(context.valueNodeById.get(id)?.provenance ?? '')));
}
function strongerDisclosure(group, context) {
  const sourceIds = new Set(context.classification.sourceCandidates
    .filter((source) => source.symbolId === group.source.symbolId && source.callableId === group.source.callableId)
    .map((source) => source.sourceCandidateId));
  return context.classification.candidateTraces.some((trace) => {
    if (!sourceIds.has(trace.sourceCandidateId)) return false;
    const sink = context.sinkById.get(trace.sinkCandidateId);
    return DISCLOSURE_SINKS.has(sink?.sinkClass) && !isDerived(trace, context);
  });
}
function canonicalRecord(records, context) {
  const declaration = context.sourceDeclaration(records[0].source);
  return [...records].sort((a, b) => {
    const aDirect = a.trace.orderedEdgeIds.length === 0 ? 0 : 1; const bDirect = b.trace.orderedEdgeIds.length === 0 ? 0 : 1;
    const declarationStart = declaration?.location?.byteStart ?? declaration?.location?.startByte;
    const aDeclaration = locationStart(a.source) === declarationStart ? 0 : 1; const bDeclaration = locationStart(b.source) === declarationStart ? 0 : 1;
    return aDirect - bDirect || aDeclaration - bDeclaration || locationStart(a.source) - locationStart(b.source)
      || locationStart(a.sink) - locationStart(b.sink) || compare(a.trace.candidateTraceId, b.trace.candidateTraceId);
  })[0];
}

export function selectCalldataOccurrences(records, context) {
  const groups = new Map();
  for (const record of records) {
    const key = keyFor(record.detector, record.source, record.decision);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  const selected = new Map(); let filteredBenignCount = 0; let filteredDeclarationOnlyCount = 0; let mergedTraceCount = 0;
  for (const recordsInGroup of groups.values()) {
    const recordsSorted = [...recordsInGroup].sort((a, b) => compare(a.trace.candidateTraceId, b.trace.candidateTraceId));
    const source = recordsSorted[0].source;
    if (source.classificationOrigin === 'identifier-name' && !hasContext(source)) { filteredDeclarationOnlyCount += 1; continue; }
    if (strongerDisclosure(recordsSorted[0], context)) { filteredBenignCount += 1; continue; }
    const canonical = canonicalRecord(recordsSorted, context);
    const semanticOccurrenceId = classificationId('calldata-semantic-occurrence', {
      detectorId: canonical.detector.detectorId, symbolId: source.symbolId, callableId: source.callableId,
      contractId: source.contractId, dataClass: source.dataClass, dispositionReason: canonical.decision?.reason ?? null,
      policyRuleId: canonical.decision?.policyRuleId ?? null,
    });
    selected.set(`${canonical.detector.detectorId}\u0000${canonical.trace.candidateTraceId}`, { semanticOccurrenceId, records: recordsSorted });
    mergedTraceCount += recordsSorted.length - 1;
  }
  return { selected, diagnostics: { rawCandidateCount: records.length, semanticOccurrenceCount: selected.size,
    duplicateCandidateCount: Math.max(0, records.length - groups.size), filteredBenignCount, filteredDeclarationOnlyCount, mergedTraceCount } };
}
