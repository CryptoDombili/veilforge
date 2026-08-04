export const SINK_CLASSES = Object.freeze(['public-storage', 'public-getter', 'event', 'calldata', 'return', 'revert-custom-error', 'external-call', 'metadata-uri']);
export class SinkCandidate {
  constructor(fields = {}) { Object.assign(this, { sinkCandidateId: fields.sinkCandidateId, sinkClass: fields.sinkClass,
    valueNodeId: fields.valueNodeId, callableId: fields.callableId ?? null, contractId: fields.contractId ?? null, location: fields.location ?? null,
    argumentIndex: fields.argumentIndex ?? null, externalTarget: fields.externalTarget ?? null, evidence: fields.evidence ?? [],
    confidence: fields.confidence ?? 'high', complete: fields.complete !== false, incomplete: fields.complete === false, reason: fields.reason ?? null }); }
}
