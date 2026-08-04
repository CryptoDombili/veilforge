import { detectorEvidence } from '../detector-evidence.js';
import { treasuryDetector } from './factory.js';
export const treasuryExternalCallDisclosure = treasuryDetector('arc-treasury.external-call-disclosure', 'external-call', 'treasury.external-call-disclosure', {
  evidence: ({ sink }) => [detectorEvidence('treasury-external-target', sink.sinkCandidateId, JSON.stringify(sink.externalTarget ?? { resolutionStatus: 'unknown' }), sink.location)],
});
