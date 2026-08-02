import { stableFingerprint } from './canonical.js';

function vectorsFor(policy) {
  const vectors = [
    { actor: 'unauthorized-caller', input: 'selector + zeroed arguments', property: `${policy.recommendation} policy cannot be bypassed` },
  ];
  if (/uint|int/.test(policy.signature)) vectors.push({ actor: 'boundary-caller', input: '0, 1, max uint', property: 'Boundary values do not disclose protected state' });
  if (/bytes|string/.test(policy.signature)) vectors.push({ actor: 'payload-observer', input: 'empty, 1 byte, maximum practical payload', property: 'Dynamic calldata is intentionally classified' });
  if (/address/.test(policy.signature)) vectors.push({ actor: 'identity-prober', input: 'zero, caller, contract address', property: 'Address substitution cannot cross the identity boundary' });
  return vectors;
}

export function buildSourceGuidedFuzzPlan({ sourceHash, policies, findings }) {
  const campaigns = policies.filter((policy) => policy.recommendation !== 'Open').slice(0, 24).map((policy) => {
    const vectors = vectorsFor(policy);
    const linkedFindings = findings.filter((finding) => finding.contractName === policy.contractName && (finding.functionName === policy.functionName || finding.startLine === policy.startLine));
    return {
      id: stableFingerprint(['fuzz-campaign', sourceHash, policy.file, policy.selector, ...vectors.flatMap((vector) => [vector.actor, vector.input])]),
      contractName: policy.contractName,
      file: policy.file,
      functionName: policy.functionName,
      signature: policy.signature,
      selector: policy.selector,
      policy: policy.recommendation,
      vectors,
      linkedFindingFingerprints: linkedFindings.map((finding) => finding.fingerprint),
    };
  });
  return {
    version: '1.0',
    mode: 'source-guided-plan',
    executed: false,
    disclaimer: 'VeilForge generated deterministic fuzz properties and vectors but did not execute EVM bytecode. Run the exported plan with a compiler-backed Foundry test suite.',
    planId: stableFingerprint(['source-guided-fuzz-plan', sourceHash, ...campaigns.map((campaign) => campaign.id)]),
    summary: {
      campaigns: campaigns.length,
      vectors: campaigns.reduce((total, campaign) => total + campaign.vectors.length, 0),
      executed: 0,
    },
    recommendedCommand: 'forge test --fuzz-runs 1024',
    campaigns,
  };
}
