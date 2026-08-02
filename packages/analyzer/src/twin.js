import { stableFingerprint } from './canonical.js';

function publicVisibilityFor(policy) {
  if (policy.recommendation === 'Open') return 'Public calldata and execution metadata';
  if (policy.recommendation === 'Locked') return 'Callable surface remains observable even when reverted';
  return 'Authorized call; calldata and execution metadata remain public';
}

function apsVisibilityFor(policy) {
  if (policy.recommendation === 'Open') return 'Explicitly exposed through an Open policy';
  if (policy.recommendation === 'Locked') return 'Unconditionally blocked by policy';
  return 'Confidential execution with an explicit caller grant';
}

export function buildPrivacyDeploymentTwin({ projectId, sourceHash, contracts, policies, findings, genome, intent }) {
  const surfaces = policies.map((policy) => ({
    id: stableFingerprint(['twin-surface', policy.file, policy.contractName, policy.selector, policy.recommendation]),
    contractName: policy.contractName,
    file: policy.file,
    functionName: policy.functionName,
    signature: policy.signature,
    selector: policy.selector,
    recommendation: policy.recommendation,
    publicEvm: publicVisibilityFor(policy),
    apsSimulation: apsVisibilityFor(policy),
    adaptation: policy.recommendation === 'Restricted'
      ? 'Define caller grants and a revocation path.'
      : policy.recommendation === 'Locked'
        ? 'Keep disabled unless the privacy intent is explicitly revised.'
        : 'Document this exposure as intentional and test public metadata leakage.',
  }));
  const trustRequirements = findings
    .filter((finding) => ['VF006', 'VF007'].includes(finding.ruleId))
    .map((finding) => ({
      id: stableFingerprint(['twin-trust', finding.fingerprint]),
      contractName: finding.contractName,
      file: finding.file,
      line: finding.startLine,
      status: 'Explicit trust decision required',
      reason: finding.impact,
    }));
  const restricted = surfaces.filter((surface) => surface.recommendation === 'Restricted').length;
  const locked = surfaces.filter((surface) => surface.recommendation === 'Locked').length;
  const open = surfaces.length - restricted - locked;
  const readinessScore = Math.max(0, Math.min(100, Math.round((intent.complianceScore + (100 - Math.min(100, genome.metrics.publicExposures * 7)) + (trustRequirements.length ? Math.max(0, 100 - trustRequirements.length * 20) : 100)) / 3)));
  const twinId = stableFingerprint(['privacy-deployment-twin', projectId, sourceHash, readinessScore, ...surfaces.map((surface) => surface.id), ...trustRequirements.map((item) => item.id)]);
  return {
    version: '1.0',
    mode: 'aps-readiness-simulation',
    twinId,
    projectId,
    sourceHash,
    readinessScore,
    status: readinessScore >= 90 && trustRequirements.length === 0 ? 'APS-ready by source evidence' : readinessScore >= 65 ? 'Adaptation required' : 'Privacy boundary redesign required',
    availability: {
      apsAvailable: false,
      label: 'ROADMAP SIMULATION',
      statement: 'APS is not currently available on Arc. VeilForge models the published design without claiming live confidential execution.',
    },
    summary: {
      contracts: contracts.length,
      selectors: surfaces.length,
      open,
      restricted,
      locked,
      trustDecisions: trustRequirements.length,
      publicExposurePaths: genome.metrics.publicExposures,
    },
    surfaces,
    trustRequirements,
  };
}
