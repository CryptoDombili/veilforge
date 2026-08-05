import { classificationId, compare, locationAnchor } from '../classification/common.js';
import { DetectorResult } from './detector-result.js';
import { createDetectorContext } from './detector-context.js';
import { detectorDisposition } from './detector-disposition.js';
import { buildDetectorEvidence } from './detector-evidence.js';
import { summarizeDetectorRun } from './summary.js';
import { detectorMetadata } from './detector-metadata.js';
import { selectCalldataOccurrences } from './calldata-occurrence.js';

export function runDetectors(classification, registry, options = {}) {
  const domain = registry.detectors[0]?.domain ?? options.domain ?? 'arc-payments';
  const context = createDetectorContext(classification, { ...options, domain }); const results = new Map();
  const calldataRecords = [];
  for (const trace of classification.candidateTraces) {
    const source = context.sourceById.get(trace.sourceCandidateId); const sink = context.sinkById.get(trace.sinkCandidateId);
    if (!context.isDomainSource(source) || sink?.sinkClass !== 'calldata' || context.sourceDeclaration(source)?.constant) continue;
    for (const detector of registry.detectors) if (detector.matches({ context, source, sink, trace })) {
      calldataRecords.push({ detector, trace, source, sink, decision: context.decisionByTrace.get(trace.candidateTraceId) ?? null });
    }
  }
  const calldataSelection = selectCalldataOccurrences(calldataRecords, context);
  for (const trace of [...classification.candidateTraces].sort((a, b) => compare(a.candidateTraceId, b.candidateTraceId))) {
    const source = context.sourceById.get(trace.sourceCandidateId); const sink = context.sinkById.get(trace.sinkCandidateId);
    if (!context.isDomainSource(source) || !sink) continue;
    const declaration = context.sourceDeclaration(source);
    if (declaration?.constant) continue;
    for (const detector of registry.detectors) {
      if (!detector.matches({ context, source, sink, trace })) continue;
      const calldataOccurrence = sink.sinkClass === 'calldata' ? calldataSelection.selected.get(`${detector.detectorId}\u0000${trace.candidateTraceId}`) : null;
      if (sink.sinkClass === 'calldata' && !calldataOccurrence) continue;
      const decision = context.decisionByTrace.get(trace.candidateTraceId) ?? null;
      const acceptedRisk = context.acceptedRisk(decision);
      const globalIncomplete = context.globalIncomplete.filter((reason) => {
        if (reason === 'dynamic-function-pointer' && sink.reason === 'abi-encoding-boundary') return false;
        const entry = classification.incomplete.find((item) => item.reason === reason);
        return !entry?.callableId || [source.callableId, sink.callableId].includes(entry.callableId);
      });
      const disposition = detectorDisposition({ trace, source, sink, decision, acceptedRisk, globalIncomplete });
      const semantic = { detectorId: detector.detectorId, sourceCandidateId: source.sourceCandidateId, sinkCandidateId: sink.sinkCandidateId, candidateTraceId: trace.candidateTraceId };
      const fingerprint = classificationId('detector-fingerprint', semantic);
      const incompleteReasons = [...new Set([...disposition.incompleteReasons, ...(detector.incompleteReasons?.({ context, source, sink, trace }) ?? [])])].sort(compare);
      const finalDisposition = incompleteReasons.length ? 'incomplete' : disposition.disposition;
      const metadata = detectorMetadata(detector); const fields = {
        detectorId: detector.detectorId, detectorVersion: detector.detectorVersion ?? '1.0.0', domain,
        category: metadata.category, stableRuleKey: metadata.stableRuleKey, titleKey: metadata.titleKey, sourceClasses: metadata.sourceClasses, sinkClasses: metadata.sinkClasses,
        sourceCandidateId: source.sourceCandidateId, sinkCandidateId: sink.sinkCandidateId, candidateTraceId: trace.candidateTraceId,
        semanticOccurrenceId: calldataOccurrence?.semanticOccurrenceId ?? null,
        supportingCandidateTraceIds: calldataOccurrence?.records.map((item) => item.trace.candidateTraceId) ?? [trace.candidateTraceId],
        dataClass: source.dataClass, sinkClass: sink.sinkClass, contractId: sink.contractId ?? source.contractId,
        callableId: sink.callableId ?? source.callableId, primaryLocation: locationAnchor(sink.location ?? source.location),
        sourceLocation: locationAnchor(source.location), sinkLocation: locationAnchor(sink.location), confidence: trace.confidence,
        disposition: finalDisposition, declassificationDecisionId: decision?.decisionId ?? null,
        policyRuleId: decision?.policyRuleId ?? null, acceptedRiskId: acceptedRisk?.acceptedRiskId ?? null,
        acceptedRiskMetadata: acceptedRisk ? { owner: acceptedRisk.owner, expiry: acceptedRisk.expiry, scope: acceptedRisk.scope, valid: acceptedRisk.valid, validationReason: acceptedRisk.validationReason } : null,
        complete: finalDisposition !== 'incomplete', incompleteReasons,
        remediationKey: detector.remediationKey, fingerprint,
      };
      const evidenceRecords = calldataOccurrence?.records ?? [{ source, sink, trace, decision }];
      const evidence = evidenceRecords.flatMap((record) => buildDetectorEvidence({ source: record.source, sink: record.sink, trace: record.trace,
        decision: record.decision, acceptedRisk, incompleteReasons }));
      for (const item of detector.evidence?.({ context, source, sink, trace }) ?? []) evidence.push(item);
      fields.evidence = [...new Map(evidence.map((item) => [item.detectorEvidenceId, item])).values()].sort((a, b) => compare(a.detectorEvidenceId, b.detectorEvidenceId));
      const result = new DetectorResult({ ...fields, detectorResultId: classificationId('detector-result', { ...semantic, disposition: finalDisposition, fingerprint }) });
      results.set(result.detectorResultId, result);
    }
  }
  const sorted = [...results.values()].sort((a, b) => compare(a.detectorResultId, b.detectorResultId));
  return { schemaVersion: '1.0.0', engineVersion: classification.engineVersion, detectorRunId: classificationId('detector-run', { classificationId: classification.classificationId, detectorIds: registry.detectors.map((item) => item.detectorId) }),
    classificationId: classification.classificationId, domain, results: sorted, summary: summarizeDetectorRun(sorted), calldataDiagnostics: calldataSelection.diagnostics };
}
