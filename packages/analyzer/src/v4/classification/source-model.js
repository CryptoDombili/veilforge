export class SourceCandidate {
  constructor(fields = {}) { Object.assign(this, { sourceCandidateId: fields.sourceCandidateId, dataClass: fields.dataClass, domain: fields.domain,
    symbolId: fields.symbolId ?? null, valueNodeId: fields.valueNodeId ?? null, callableId: fields.callableId ?? null,
    contractId: fields.contractId ?? null, location: fields.location ?? null, evidence: fields.evidence ?? [], confidence: fields.confidence ?? 'low',
    classificationOrigin: fields.classificationOrigin ?? 'inference', policyLabel: fields.policyLabel ?? null,
    complete: fields.complete !== false, incomplete: fields.complete === false, reason: fields.reason ?? null }); }
}
