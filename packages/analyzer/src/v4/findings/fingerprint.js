import { classificationId } from '../classification/common.js';
import { FINDING_VERSION } from './finding.js';

export function occurrenceId(result) {
  return classificationId('finding-occurrence', { domain: result.domain, dataClass: result.dataClass, sinkClass: result.sinkClass, sourceCandidateId: result.sourceCandidateId, sinkCandidateId: result.sinkCandidateId, candidateTraceId: result.candidateTraceId, contractId: result.contractId, callableId: result.callableId });
}

export function createFindingFingerprint(fields) {
  return classificationId('finding-fingerprint', { findingVersion: FINDING_VERSION, category: fields.category, domain: fields.domain, dataClass: fields.dataClass, sinkClass: fields.sinkClass, sourceCandidateIds: fields.sourceCandidateIds, sinkCandidateIds: fields.sinkCandidateIds, contractIds: fields.contractIds, callableIds: fields.callableIds, groupedOccurrenceIds: fields.groupedOccurrenceIds, disposition: fields.disposition, policyRuleIds: fields.policyRuleIds, acceptedRiskIds: fields.acceptedRiskIds });
}

export function createFindingId(fingerprint) { return classificationId('finding', { findingVersion: FINDING_VERSION, fingerprint }); }
