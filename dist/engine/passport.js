import { stableFingerprint } from './canonical.js';

export function buildPrivacyPassport({ projectId, sourceHash, score, status, genome, intent, attackLab, forgePlan, lineage }) {
  const deploymentGate = status === 'Ready' && intent.complianceScore >= 90 && attackLab.summary.mapped === 0 ? 'Source checks passed' : 'Review required';
  const passportStatus = status === 'Deployment Blocked' || intent.complianceScore < 50 ? 'Suspended' : status === 'Ready' ? 'Active' : 'Review';
  const fingerprint = stableFingerprint([
    'privacy-passport', projectId, sourceHash, score, intent.complianceScore,
    attackLab.summary.defenseScore, genome.metrics.blastRadius, forgePlan.summary.candidateReady, lineage.lineageId,
  ]);
  return {
    version: '3.2-ascension',
    passportId: fingerprint,
    projectId,
    sourceHash,
    status: passportStatus,
    deploymentGate,
    revision: lineage.revision,
    lineageId: lineage.lineageId,
    validity: {
      status: 'Source-bound',
      reason: 'The passport is current only for the exact canonical source hash.',
      deploymentEvidence: 'Unlinked',
    },
    pillars: {
      technicalSafety: score,
      intentCompliance: intent.complianceScore,
      attackDefense: attackLab.summary.defenseScore,
      identityProtection: Math.max(0, 100 - genome.metrics.identityLinkability),
      deploymentLineage: lineage.sourceGateReady ? 'Rehearsal ready' : 'Review required',
      monitoring: 'Living local record',
    },
    evidence: {
      sensitiveAssets: genome.metrics.sensitiveAssets,
      publicExposures: genome.metrics.publicExposures,
      mappedCampaigns: attackLab.summary.mapped,
      candidatePatches: forgePlan.summary.candidateReady,
    },
    claims: [
      'Source processed locally without an AI API.',
      'Output derived from the canonical VeilForge analyzer.',
      'Passport validity is bound to the exact source hash.',
      'Deployment evidence remains locally unverified until an Arc contract, transaction and bytecode hash are linked.',
      'A source hash mismatch automatically makes linked evidence stale.',
    ],
  };
}
