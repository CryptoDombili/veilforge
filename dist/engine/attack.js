import { stableFingerprint } from './canonical.js';

const RULE_SCENARIOS = Object.freeze({
  VF001: ['Public observer', 'Storage getter', 'Read the sensitive public state value directly.'],
  VF002: ['Public observer', 'Event schema', 'Decode sensitive fields from a permanent event schema.'],
  VF003: ['Unauthorized user', 'Revert channel', 'Trigger a failing call and inspect the returned error text.'],
  VF004: ['Unauthorized user', 'Read selector', 'Call the unguarded sensitive read function.'],
  VF005: ['Unauthorized user', 'Write selector', 'Invoke a sensitive state-changing function without an explicit guard.'],
  VF006: ['Malicious integration', 'External call', 'Cross the trust boundary through a low-level call.'],
  VF007: ['External contract', 'Contract boundary', 'Observe sensitive values forwarded to another contract.'],
  VF008: ['Public observer', 'Mapping getter', 'Query the compiler-generated public mapping getter.'],
  VF009: ['Compromised operator', 'Admin selector', 'Invoke an administrative mutation without least-privilege authorization.'],
  VF010: ['Phishing intermediary', 'Authorization', 'Route the call through an intermediary and exploit tx.origin confusion.'],
  VF011: ['Public observer', 'Event log', 'Recover sensitive runtime values from emitted log data.'],
  VF012: ['Public observer', 'Calldata', 'Decode a sensitive dynamic payload from transaction input bytes.'],
  VF000: ['Build system', 'Parser boundary', 'Prevent trustworthy analysis by supplying unsupported or malformed source.'],
});

function severityWeight(severity) {
  return ({ critical: 25, high: 15, medium: 8, low: 3 })[severity] ?? 5;
}

export function buildAttackLab(findings, chains, genome) {
  const campaigns = findings.map((finding, index) => {
    const [actor, channel, objective] = RULE_SCENARIOS[finding.ruleId] ?? ['Adversarial caller', finding.category, finding.impact];
    const chain = chains.find((item) => item.findingFingerprint === finding.fingerprint);
    const steps = [
      { phase: 'Recon', label: `Locate ${finding.contractName}`, detail: `${finding.file}:${finding.startLine}` },
      { phase: 'Reach', label: channel, detail: finding.evidence || finding.title },
      ...(chain?.nodes ?? []).filter((node) => node.detected).slice(0, 3).map((node) => ({ phase: node.type, label: node.label, detail: node.detail })),
      { phase: 'Impact', label: finding.title, detail: finding.impact },
    ];
    const replayFrames = steps.map((step, frameIndex) => ({
      frame: frameIndex + 1,
      phase: step.phase,
      headline: step.label,
      telemetry: step.detail,
      signal: frameIndex === steps.length - 1 ? 'impact' : frameIndex === 0 ? 'recon' : 'propagation',
    }));
    return {
      id: stableFingerprint(['attack', finding.fingerprint]),
      sequence: index + 1,
      title: `${actor} · ${channel}`,
      actor,
      channel,
      objective,
      ruleId: finding.ruleId,
      findingFingerprint: finding.fingerprint,
      severity: finding.severity,
      status: finding.ruleId === 'VF000' ? 'Analysis blocked' : 'Source evidence mapped',
      confidence: finding.confidence,
      file: finding.file,
      line: finding.startLine,
      contractName: finding.contractName,
      blastRadius: Math.min(10, Number((severityWeight(finding.severity) / 3 + genome.metrics.publicExposures * 0.25).toFixed(1))),
      steps,
      replay: {
        mode: 'source-evidence-cinema',
        durationMs: Math.max(1800, replayFrames.length * 700),
        frames: replayFrames,
        outcome: finding.ruleId === 'VF000' ? 'Analysis boundary reached' : 'Disclosure path demonstrated from source evidence',
      },
    };
  });

  const weightedExposure = findings.reduce((total, finding) => total + severityWeight(finding.severity), 0);
  const defenseScore = Math.max(0, Math.min(100, 100 - weightedExposure));
  return {
    version: '3.2',
    mode: 'deterministic-evidence-replay',
    disclaimer: 'This release maps adversarial paths from deterministic source evidence. It does not execute bytecode or claim full EVM emulation.',
    campaigns,
    summary: {
      attempts: campaigns.length,
      mapped: campaigns.filter((item) => item.status === 'Source evidence mapped').length,
      blockedAnalysis: campaigns.filter((item) => item.status === 'Analysis blocked').length,
      defenseScore,
      maximumBlastRadius: campaigns.reduce((value, campaign) => Math.max(value, campaign.blastRadius), 0),
    },
  };
}

function mriChannel(finding) {
  if (['VF002', 'VF011'].includes(finding.ruleId)) return 'Event log';
  if (finding.ruleId === 'VF012') return 'Calldata';
  if (['VF001', 'VF008'].includes(finding.ruleId)) return 'Public storage';
  if (['VF006', 'VF007'].includes(finding.ruleId)) return 'External call';
  if (['VF004', 'VF005', 'VF009', 'VF010'].includes(finding.ruleId)) return 'Authorization surface';
  return 'Execution trace';
}

export function buildTransactionMRI(findings, chains) {
  const traces = findings.slice(0, 24).map((finding) => {
    const chain = chains.find((item) => item.findingFingerprint === finding.fingerprint);
    const stages = [
      { order: 1, phase: 'Input', title: 'Call surface identified', detail: `${finding.contractName} · ${finding.file}:${finding.startLine}`, visibility: 'Observer-visible metadata' },
      ...(chain?.nodes ?? []).filter((node) => node.detected).slice(0, 4).map((node, index) => ({ order: index + 2, phase: node.type, title: node.label, detail: node.detail, visibility: node.type === 'Policy' ? 'Control boundary' : 'Execution evidence' })),
      { order: (chain?.nodes?.filter((node) => node.detected).length ?? 0) + 2, phase: 'Disclosure', title: mriChannel(finding), detail: finding.impact, visibility: finding.suggestedPolicy },
    ];
    return {
      id: stableFingerprint(['mri', finding.fingerprint]),
      title: `${finding.ruleId} · ${finding.contractName}`,
      severity: finding.severity,
      channel: mriChannel(finding),
      file: finding.file,
      line: finding.startLine,
      stages,
    };
  });
  return { version: '3.2', traces };
}
