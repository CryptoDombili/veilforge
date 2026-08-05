import { classificationId, compare } from '../classification/common.js';

const PREDICATE_PROVENANCE = /^(?:binary:(?:==|!=|>|<|>=|<=|&&|\|\|)|unary:!)/u;
const METADATA_CONTEXT = /(?:metadata|uri|memo)/iu;

function keyFor(record) {
  const sinkIdentity = record.sink.sinkClass === 'return' && record.sink.semanticSinkKey
    ? record.sink.semanticSinkKey : record.sink.sinkCandidateId;
  return JSON.stringify([record.detector.detectorId, record.source.symbolId ?? record.source.sourceCandidateId,
    sinkIdentity, record.source.dataClass, record.source.callableId, record.sink.callableId,
    record.decision?.reason ?? null, record.decision?.policyRuleId ?? null]);
}
function derivedPredicate(record, context) {
  if (record.sink.sinkClass !== 'return') return false;
  return record.trace.orderedValueNodeIds.slice(1, -1).some((id) => PREDICATE_PROVENANCE.test(String(context.valueNodeById.get(id)?.provenance ?? '')));
}
function falseExternalBoundary(record, context) {
  return record.decision?.reason === 'policy-approved-wrapper' && record.sink.sinkClass === 'external-call' && record.sink.reason === 'dynamic-function-pointer'
    && context.classification.sinkCandidates.some((sink) => sink.valueNodeId === record.sink.valueNodeId
      && sink.sinkClass === 'metadata-uri' && sink.reason === 'abi-encoding-boundary');
}
function falseMetadataBoundary(record, context) {
  if (record.sink.sinkClass !== 'metadata-uri' || record.sink.reason !== 'abi-encoding-boundary') return false;
  const callable = context.callable(record.sink.callableId);
  return !METADATA_CONTEXT.test(`${callable?.name ?? ''} ${callable?.canonicalName ?? ''}`);
}
function approvedWrapperReturn(record, context) {
  if (record.decision?.reason !== 'policy-approved-wrapper' || record.sink.sinkClass !== 'return') return false;
  const actual = context.callable(record.sink.callableId)?.canonicalName;
  const expected = record.decision.transformationCallable;
  return actual === expected || actual?.endsWith(`.${expected}`) || actual?.endsWith(`:${expected}`);
}
function redundantMetadataReturn(record, context) {
  if (record.sink.sinkClass !== 'return') return false;
  const callable = context.callable(record.sink.callableId);
  if (!METADATA_CONTEXT.test(`${callable?.name ?? ''} ${callable?.canonicalName ?? ''}`)) return false;
  const metadataSinkIds = new Set(context.classification.sinkCandidates
    .filter((sink) => sink.sinkClass === 'metadata-uri' && sink.callableId === record.sink.callableId)
    .map((sink) => sink.sinkCandidateId));
  return context.classification.candidateTraces.some((trace) => trace.sourceCandidateId === record.source.sourceCandidateId
    && metadataSinkIds.has(trace.sinkCandidateId));
}
function canonical(records) {
  return [...records].sort((a, b) => a.trace.orderedEdgeIds.length - b.trace.orderedEdgeIds.length
    || compare(a.source.sourceCandidateId, b.source.sourceCandidateId)
    || compare(a.trace.candidateTraceId, b.trace.candidateTraceId))[0];
}

export function selectBoundaryOccurrences(records, context) {
  const groups = new Map(); let derivedExpressionFilteredCount = 0; let falseBoundaryFilteredCount = 0;
  for (const record of records) {
    if (derivedPredicate(record, context)) { derivedExpressionFilteredCount += 1; continue; }
    if (falseExternalBoundary(record, context) || falseMetadataBoundary(record, context)
      || approvedWrapperReturn(record, context) || redundantMetadataReturn(record, context)) { falseBoundaryFilteredCount += 1; continue; }
    const key = keyFor(record); groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  const selected = new Map(); let duplicateBoundaryCount = 0;
  for (const recordsInGroup of groups.values()) {
    const chosen = canonical(recordsInGroup); const semanticOccurrenceId = classificationId('disclosure-semantic-boundary', {
      detectorId: chosen.detector.detectorId, symbolId: chosen.source.symbolId, sinkCandidateId: chosen.sink.sinkCandidateId,
      dataClass: chosen.source.dataClass, sourceCallableId: chosen.source.callableId, sinkCallableId: chosen.sink.callableId,
      dispositionReason: chosen.decision?.reason ?? null, policyRuleId: chosen.decision?.policyRuleId ?? null,
    });
    selected.set(`${chosen.detector.detectorId}\u0000${chosen.trace.candidateTraceId}`, { semanticOccurrenceId,
      records: [...recordsInGroup].sort((a, b) => compare(a.trace.candidateTraceId, b.trace.candidateTraceId)) });
    duplicateBoundaryCount += recordsInGroup.length - 1;
  }
  return { selected, diagnostics: { rawCandidateCount: records.length, semanticBoundaryCount: selected.size,
    duplicateBoundaryCount, derivedExpressionFilteredCount, falseBoundaryFilteredCount,
    crossDetectorMergedCount: 0, policyFilteredCount: 0, incompleteMergedCount: 0 } };
}
