export const FINDING_VERSION = '1.0.0';

export class FindingV4 {
  constructor(fields = {}) {
    Object.assign(this, {
      findingId: fields.findingId,
      findingVersion: fields.findingVersion ?? FINDING_VERSION,
      fingerprint: fields.fingerprint,
      detectorId: fields.detectorId,
      detectorVersion: fields.detectorVersion ?? '1.0.0',
      relatedDetectorIds: fields.relatedDetectorIds ?? [],
      domain: fields.domain,
      category: fields.category,
      semanticCategories: fields.semanticCategories ?? [],
      dataClass: fields.dataClass,
      sinkClass: fields.sinkClass,
      severity: fields.severity ?? 'unknown',
      confidence: fields.confidence ?? 'unknown',
      disposition: fields.disposition,
      titleKey: fields.titleKey,
      remediationKey: fields.remediationKey,
      primaryLocation: fields.primaryLocation ?? null,
      sourceLocations: fields.sourceLocations ?? [],
      sinkLocations: fields.sinkLocations ?? [],
      callableIds: fields.callableIds ?? [],
      contractIds: fields.contractIds ?? [],
      detectorResultIds: fields.detectorResultIds ?? [],
      candidateTraceIds: fields.candidateTraceIds ?? [],
      sourceCandidateIds: fields.sourceCandidateIds ?? [],
      sinkCandidateIds: fields.sinkCandidateIds ?? [],
      orderedEvidence: fields.orderedEvidence ?? [],
      occurrenceCount: fields.occurrenceCount ?? 0,
      groupedOccurrenceIds: fields.groupedOccurrenceIds ?? [],
      complete: fields.complete !== false,
      incomplete: fields.complete === false,
      incompleteReasons: fields.incompleteReasons ?? [],
      declassificationDecisionIds: fields.declassificationDecisionIds ?? [],
      acceptedRiskIds: fields.acceptedRiskIds ?? [],
      policyRuleIds: fields.policyRuleIds ?? [],
      suppression: fields.suppression,
      summaryMetadata: fields.summaryMetadata ?? {},
    });
  }
}
