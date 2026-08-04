import { classificationId, compare, locationAnchor } from '../classification/common.js';

function item(kind, origin, detail, location = null) {
  const value = { kind, origin, detail, location: locationAnchor(location) };
  return { detectorEvidenceId: classificationId('detector-evidence', value), ...value };
}

export function buildDetectorEvidence({ source, sink, trace, decision, acceptedRisk, incompleteReasons }) {
  const result = [
    ...source.evidence.map((entry) => item('source-classification', entry.evidenceId, entry.detail, entry.location)),
    item('source-location', source.sourceCandidateId, source.dataClass, source.location),
    ...trace.orderedEdgeIds.map((edgeId, index) => item('trace-edge', edgeId, String(index))),
    ...trace.callableTransitions.map((entry) => item('callable-transition', entry.edgeId, `${entry.fromCallableId}->${entry.toCallableId}:${entry.flowKind}`)),
    ...sink.evidence.map((entry) => item('sink-classification', entry.evidenceId, entry.detail, entry.location)),
    item('sink-location', sink.sinkCandidateId, sink.sinkClass, sink.location),
  ];
  if (decision) result.push(item('declassification', decision.decisionId, `${decision.decision}:${decision.reason}`, decision.location));
  if (acceptedRisk) result.push(item('accepted-risk', acceptedRisk.acceptedRiskId, `${acceptedRisk.valid}:${acceptedRisk.validationReason}`));
  for (const reason of incompleteReasons) result.push(item('incomplete-marker', reason, reason));
  return [...new Map(result.map((entry) => [entry.detectorEvidenceId, entry])).values()].sort((a, b) => compare(a.detectorEvidenceId, b.detectorEvidenceId));
}
