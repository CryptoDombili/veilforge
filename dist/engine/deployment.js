import { stableFingerprint } from './canonical.js';

export const ARC_TESTNET_PROFILE = Object.freeze({
  chainId: 5_042_002,
  chainIdHex: '0x4cef52',
  name: 'Arc Testnet',
  gasToken: 'USDC',
  finality: 'sub-second deterministic finality',
  explorer: 'https://testnet.arcscan.app',
});

function stage(id, label, status, evidence, blocksDeployment = false) {
  return { id, label, status, evidence, blocksDeployment };
}

export function buildDeploymentLineage({ projectId, sourceHash, status, intent, attackLab, forgePlan }) {
  const stages = [
    stage('source', 'Canonical source captured', 'complete', sourceHash),
    stage('intent', 'Privacy intent compiled', 'complete', `${intent.profile} · ${intent.complianceScore}/100`),
    stage('evidence', 'Adversarial evidence mapped', attackLab.summary.mapped ? 'review' : 'complete', `${attackLab.summary.mapped} paths`, attackLab.summary.mapped > 0),
    stage('forge', 'Hardening candidates reviewed', forgePlan.summary.engineeringReview ? 'review' : 'complete', `${forgePlan.summary.candidateReady} candidates · ${forgePlan.summary.engineeringReview} manual`, forgePlan.summary.engineeringReview > 0),
    stage('bytecode', 'Compiled bytecode linked', 'pending', 'Awaiting compiler artifact'),
    stage('deployment', 'Arc deployment linked', 'pending', 'Awaiting Arc Testnet transaction'),
  ];
  const lineageId = stableFingerprint(['deployment-lineage', projectId, sourceHash, ...stages.flatMap((item) => [item.id, item.status, item.evidence])]);
  const sourceGateReady = status === 'Ready' && intent.complianceScore >= 90 && attackLab.summary.mapped === 0;
  return {
    version: '1.0',
    lineageId,
    projectId,
    sourceHash,
    revision: 1,
    state: sourceGateReady ? 'Ready for deployment rehearsal' : 'Source review required',
    sourceGateReady,
    stages,
    deployment: {
      network: ARC_TESTNET_PROFILE.name,
      chainId: ARC_TESTNET_PROFILE.chainId,
      contractAddress: null,
      transactionHash: null,
      bytecodeHash: null,
      verification: 'Unlinked',
    },
  };
}

export function evaluateDeploymentEvidence(lineage, evidence = {}) {
  const contractAddress = String(evidence.contractAddress || '').trim();
  const transactionHash = String(evidence.transactionHash || '').trim().toLowerCase();
  const bytecodeHash = String(evidence.bytecodeHash || '').trim().toLowerCase();
  const sourceHash = String(evidence.sourceHash || '').trim().toLowerCase();
  const chainId = Number(evidence.chainId || ARC_TESTNET_PROFILE.chainId);
  if (!contractAddress && !transactionHash && !bytecodeHash) {
    return { status: 'Unlinked', valid: false, reason: 'No deployment evidence has been linked.', attestationId: null };
  }
  if (sourceHash && sourceHash !== lineage.sourceHash.toLowerCase()) {
    return { status: 'Stale', valid: false, reason: 'Linked deployment evidence belongs to a different source hash.', attestationId: null };
  }
  if (chainId !== ARC_TESTNET_PROFILE.chainId) {
    return { status: 'Network mismatch', valid: false, reason: `Expected Arc Testnet chain ${ARC_TESTNET_PROFILE.chainId}.`, attestationId: null };
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(contractAddress) || !/^0x[0-9a-f]{64}$/.test(transactionHash) || !/^0x[0-9a-f]{64}$/.test(bytecodeHash)) {
    return { status: 'Invalid evidence', valid: false, reason: 'Address, transaction hash, and bytecode hash must be complete hexadecimal values.', attestationId: null };
  }
  const attestationId = stableFingerprint(['deployment-evidence', lineage.lineageId, chainId, contractAddress.toLowerCase(), transactionHash, bytecodeHash]);
  return {
    status: 'Evidence linked',
    valid: true,
    reason: 'Evidence is locally bound to this source. RPC bytecode verification is still required.',
    attestationId,
    network: ARC_TESTNET_PROFILE.name,
    chainId,
    contractAddress,
    transactionHash,
    bytecodeHash,
  };
}

export function buildArcDeployRehearsal({ sourceHash, reportStatus, summary, intent, lineage, privacyTwin }) {
  const checks = [
    { id: 'network', label: 'Arc Testnet network profile', status: 'pass', detail: `Chain ${ARC_TESTNET_PROFILE.chainId} · gas in ${ARC_TESTNET_PROFILE.gasToken}` },
    { id: 'source', label: 'Canonical source identity', status: 'pass', detail: sourceHash },
    { id: 'critical', label: 'No critical privacy findings', status: summary.critical === 0 ? 'pass' : 'block', detail: `${summary.critical} critical findings` },
    { id: 'intent', label: 'Intent compliance ≥ 90', status: intent.complianceScore >= 90 ? 'pass' : 'block', detail: `${intent.complianceScore}/100` },
    { id: 'lineage', label: 'Deployment lineage generated', status: lineage.lineageId ? 'pass' : 'block', detail: lineage.lineageId },
    { id: 'aps', label: 'APS target availability', status: 'roadmap', detail: 'APS is not currently available; this is a readiness simulation only.' },
  ];
  const blocking = checks.filter((check) => check.status === 'block').length;
  return {
    version: '1.0',
    target: 'Arc Testnet public EVM',
    apsMode: 'Roadmap readiness simulation',
    status: blocking === 0 && reportStatus === 'Ready' ? 'Ready to rehearse' : 'Blocked before wallet',
    blocking,
    checks,
    transactionPlan: [
      'Compile and test the exact canonical source.',
      'Hash the compiler bytecode artifact and bind it to the lineage.',
      `Confirm wallet network ${ARC_TESTNET_PROFILE.chainIdHex} and sufficient ${ARC_TESTNET_PROFILE.gasToken} gas balance.`,
      'Simulate constructor transaction without broadcasting.',
      'Ask the wallet for final approval, then link transaction evidence to the Living Passport.',
    ],
    twinId: privacyTwin.twinId,
  };
}
