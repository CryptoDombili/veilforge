import { classificationId, compare, locationAnchor } from '../classification/common.js';
import { DetectorResult } from './detector-result.js';
import { createDetectorContext } from './detector-context.js';
import { detectorDisposition } from './detector-disposition.js';
import { buildDetectorEvidence } from './detector-evidence.js';
import { summarizeDetectorRun } from './summary.js';

export function runDetectors(classification, registry, options = {}) {
  const context = createDetectorContext(classification, options); const results = new Map();
  for (const trace of [...classification.candidateTraces].sort((a, b) => compare(a.candidateTraceId, b.candidateTraceId))) {
    const source = context.sourceById.get(trace.sourceCandidateId); const sink = context.sinkById.get(trace.sinkCandidateId);
    if (!context.isPaymentsSource(source) || !sink) continue;
    const declaration = context.sourceDeclaration(source);
    if (declaration?.constant) continue;
    for (const detector of registry.detectors) {
      if (!detector.matches({ context, source, sink, trace })) continue;
      const decision = context.decisionByTrace.get(trace.candidateTraceId) ?? null;
      const acceptedRisk = context.acceptedRisk(decision);
      const globalIncomplete = context.globalIncomplete.filter((reason) => {
        const entry = classification.incomplete.find((item) => item.reason === reason);
        return !entry?.callableId || [source.callableId, sink.callableId].includes(entry.callableId);
      });
      const disposition = detectorDisposition({ trace, source, sink, decision, acceptedRisk, globalIncomplete });
      const semantic = { detectorId: detector.detectorId, sourceCandidateId: source.sourceCandidateId, sinkCandidateId: sink.sinkCandidateId, candidateTraceId: trace.candidateTraceId };
      const fingerprint = classificationId('detector-fingerprint', semantic);
      const incompleteReasons = [...new Set([...disposition.incompleteReasons, ...(detector.incompleteReasons?.({ context, source, sink, trace }) ?? [])])].sort(compare);
      const finalDisposition = incompleteReasons.length ? 'incomplete' : disposition.disposition;
      const fields = {
        detectorId: detector.detectorId, detectorVersion: detector.detectorVersion ?? '1.0.0', domain: 'arc-payments',
        sourceCandidateId: source.sourceCandidateId, sinkCandidateId: sink.sinkCandidateId, candidateTraceId: trace.candidateTraceId,
        dataClass: source.dataClass, sinkClass: sink.sinkClass, contractId: sink.contractId ?? source.contractId,
        callableId: sink.callableId ?? source.callableId, primaryLocation: locationAnchor(sink.location ?? source.location),
        sourceLocation: locationAnchor(source.location), sinkLocation: locationAnchor(sink.location), confidence: trace.confidence,
        disposition: finalDisposition, declassificationDecisionId: decision?.decisionId ?? null,
        acceptedRiskId: acceptedRisk?.acceptedRiskId ?? null, complete: finalDisposition !== 'incomplete', incompleteReasons,
        remediationKey: detector.remediationKey, fingerprint,
      };
      fields.evidence = buildDetectorEvidence({ source, sink, trace, decision, acceptedRisk, incompleteReasons });
      const result = new DetectorResult({ ...fields, detectorResultId: classificationId('detector-result', { ...semantic, disposition: finalDisposition, fingerprint }) });
      results.set(result.detectorResultId, result);
    }
  }
  const sorted = [...results.values()].sort((a, b) => compare(a.detectorResultId, b.detectorResultId));
  return { schemaVersion: '1.0.0', engineVersion: classification.engineVersion, detectorRunId: classificationId('detector-run', { classificationId: classification.classificationId, detectorIds: registry.detectors.map((item) => item.detectorId) }),
    classificationId: classification.classificationId, domain: 'arc-payments', results: sorted, summary: summarizeDetectorRun(sorted) };
}
