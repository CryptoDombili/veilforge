import { detectorEvidence } from '../detector-evidence.js';

const PUBLIC_SINKS = new Set(['public-storage', 'public-getter', 'event', 'calldata', 'return', 'revert-custom-error', 'external-call', 'metadata-uri']);
function alias(source) {
  const detail = source.evidence.find((item) => item.kind === 'taxonomy-alias')?.detail ?? '';
  return detail.split(':')[0];
}
function relation(source) {
  const value = alias(source);
  if (/^(?:approver|approver-identity|signer|signer-identity|approval-reference|execution-reference|allowance|spending-limit|destination|recipient)$/u.test(value)) return 'explicit';
  if (value === 'operator') return 'ambiguous';
  return null;
}
export const treasuryApprovalDisclosure = Object.freeze({
  detectorId: 'arc-treasury.approval-disclosure', detectorVersion: '1.0.0', domain: 'arc-treasury', remediationKey: 'treasury.approval-disclosure',
  matches({ source, sink }) { return PUBLIC_SINKS.has(sink.sinkClass) && relation(source) !== null; },
  incompleteReasons({ source }) { return relation(source) === 'ambiguous' ? ['ambiguous-approval-relationship'] : []; },
  evidence({ source, sink }) { return [detectorEvidence('treasury-approval-relationship', source.sourceCandidateId, `${relation(source)}:${alias(source)}:${sink.sinkClass}`, source.location)]; },
});
