import { buildFindingRun, serializeFindingRun } from '../../../packages/analyzer/src/v4/findings/index.js';

let serial = 0;
export function detectorResult(overrides = {}) {
  serial += 1; const token = overrides.token ?? String(serial);
  return {
    detectorResultId: overrides.detectorResultId ?? `result-${token}`,
    detectorId: overrides.detectorId ?? 'arc-payments.event-disclosure', detectorVersion: '1.0.0', domain: overrides.domain ?? 'arc-payments',
    sourceCandidateId: overrides.sourceCandidateId ?? `source-${token}`, sinkCandidateId: overrides.sinkCandidateId ?? `sink-${token}`, candidateTraceId: overrides.candidateTraceId ?? `trace-${token}`,
    dataClass: overrides.dataClass ?? 'customer-kyc-reference', sinkClass: overrides.sinkClass ?? 'event', contractId: overrides.contractId ?? 'contract-1', callableId: overrides.callableId ?? 'callable-1',
    primaryLocation: overrides.primaryLocation ?? { sourcePath: 'src/Case.sol', byteStart: 20, byteEnd: 30 },
    sourceLocation: overrides.sourceLocation ?? { sourcePath: 'src/Case.sol', byteStart: 5, byteEnd: 10 }, sinkLocation: overrides.sinkLocation === undefined ? { sourcePath: 'src/Case.sol', byteStart: 20, byteEnd: 30 } : overrides.sinkLocation,
    evidence: overrides.evidence ?? [{ detectorEvidenceId: `evidence-${token}`, kind: 'trace-edge', origin: `edge-${token}`, detail: '0', location: null }],
    confidence: overrides.confidence ?? 'high', disposition: overrides.disposition ?? 'detected', declassificationDecisionId: overrides.declassificationDecisionId ?? null,
    acceptedRiskId: overrides.acceptedRiskId ?? null, acceptedRiskMetadata: overrides.acceptedRiskMetadata ?? null, policyRuleId: overrides.policyRuleId ?? null, complete: overrides.complete !== false,
    incompleteReasons: overrides.incompleteReasons ?? [], remediationKey: overrides.remediationKey ?? 'remediate.test', fingerprint: `detector-fingerprint-${token}`,
  };
}
export function findings(results, options = {}) { return buildFindingRun({ engineVersion: 'test', results: Array.isArray(results) ? results : [results] }, { evaluationTime: '2026-08-05T00:00:00Z', ...options }); }
export { serializeFindingRun };
