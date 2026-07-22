import { POLICY_RANK } from './constants.js';
import { containsSensitiveTerm, hasAccessControl } from './rules.js';

const LOCK_MARKERS = ['debug', 'deprecated', 'unsafe', 'destroy', 'selfdestruct', 'dump', 'backdoor'];

export function recommendPolicies(parsedFiles) {
  const policies = parsedFiles.flatMap((parsed) =>
    parsed.functions
      .filter((fn) => fn.contractKind !== 'interface')
      .filter((fn) => fn.visibility === 'public' || fn.visibility === 'external')
      .filter((fn) => fn.functionName !== 'constructor')
      .map((fn) => {
        const context = [fn.functionName, fn.parameters.join(' '), fn.returns.join(' '), fn.source].join(' ');
        const loweredName = fn.functionName.toLowerCase();
        const locked = LOCK_MARKERS.some((marker) => loweredName.includes(marker));
        const guarded = hasAccessControl(fn.source, fn.modifiers);
        const sensitive = containsSensitiveTerm(context);
        const readOnly = fn.stateMutability === 'view' || fn.stateMutability === 'pure';
        const adminLike = /^(set|update|grant|revoke|pause|unpause|configure|approve)/i.test(fn.functionName);

        let recommendation = 'Open';
        let reason = readOnly
          ? 'The function appears to expose non-sensitive read-only behavior intended for broad use.'
          : 'No sensitive semantics or privileged guard were detected; keep open only when permissionless access is intentional.';
        let confidence = readOnly ? 'medium' : 'low';

        if (locked) {
          recommendation = 'Locked';
          reason = 'The selector appears to be debug, deprecated, destructive, or unusually dangerous and should be unavailable by default.';
          confidence = 'high';
        } else if (guarded || sensitive || adminLike) {
          recommendation = 'Restricted';
          reason = guarded
            ? 'The contract already signals an authorization boundary; the policy should preserve least-privilege access.'
            : sensitive
              ? 'The function reads or changes semantically sensitive data and should require an explicit grant.'
              : 'Administrative selectors should be limited to approved operators.';
          confidence = guarded || sensitive ? 'high' : 'medium';
        }

        return {
          file: fn.file,
          contractName: fn.contractName,
          functionName: fn.functionName,
          signature: fn.signature,
          selector: fn.selector,
          currentVisibility: fn.visibility,
          recommendation,
          reason,
          confidence,
          startLine: fn.startLine,
          endLine: fn.endLine,
        };
      }),
  );

  return policies.sort((a, b) =>
    a.file.localeCompare(b.file) ||
    a.contractName.localeCompare(b.contractName) ||
    a.startLine - b.startLine ||
    POLICY_RANK[b.recommendation] - POLICY_RANK[a.recommendation] ||
    a.signature.localeCompare(b.signature));
}

export function generatePolicyManifest(report) {
  return {
    schemaVersion: '1.0',
    generator: `VeilForge ${report.scannerVersion}`,
    sourceHash: report.sourceHash,
    reportHash: report.reportHash,
    projectStatus: report.status,
    policies: report.policies.map((policy) => ({
      contract: policy.contractName,
      selector: policy.selector,
      signature: policy.signature,
      policy: policy.recommendation,
      reason: policy.reason,
      confidence: policy.confidence,
      source: {
        file: policy.file,
        startLine: policy.startLine,
        endLine: policy.endLine,
      },
    })),
  };
}
