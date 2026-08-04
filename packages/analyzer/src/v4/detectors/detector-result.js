export class DetectorResult {
  constructor(fields = {}) {
    Object.assign(this, {
      detectorResultId: fields.detectorResultId,
      detectorId: fields.detectorId,
      detectorVersion: fields.detectorVersion ?? '1.0.0',
      domain: fields.domain,
      sourceCandidateId: fields.sourceCandidateId,
      sinkCandidateId: fields.sinkCandidateId,
      candidateTraceId: fields.candidateTraceId,
      dataClass: fields.dataClass,
      sinkClass: fields.sinkClass,
      contractId: fields.contractId ?? null,
      callableId: fields.callableId ?? null,
      primaryLocation: fields.primaryLocation ?? null,
      sourceLocation: fields.sourceLocation ?? null,
      sinkLocation: fields.sinkLocation ?? null,
      evidence: fields.evidence ?? [],
      confidence: fields.confidence ?? 'low',
      disposition: fields.disposition ?? 'not-applicable',
      declassificationDecisionId: fields.declassificationDecisionId ?? null,
      policyRuleId: fields.policyRuleId ?? null,
      acceptedRiskId: fields.acceptedRiskId ?? null,
      acceptedRiskMetadata: fields.acceptedRiskMetadata ?? null,
      complete: fields.complete !== false,
      incomplete: fields.complete === false,
      incompleteReasons: fields.incompleteReasons ?? [],
      remediationKey: fields.remediationKey,
      fingerprint: fields.fingerprint,
    });
  }
}
