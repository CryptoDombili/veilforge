import { containsSensitiveTerm, hasAccessControl } from './utils.js';
import type { ParsedFile, PolicyRecommendation } from './types.js';

const LOCK_MARKERS = ['debug', 'deprecated', 'unsafe', 'destroy', 'selfdestruct', 'dump', 'backdoor'];

export function recommendPolicies(parsedFiles: ParsedFile[]): PolicyRecommendation[] {
  return parsedFiles
    .flatMap((parsed) =>
      parsed.functions
        .filter((fn) => fn.visibility === 'public' || fn.visibility === 'external')
        .filter((fn) => fn.functionName !== 'constructor')
        .map((fn): PolicyRecommendation => {
          const context = [fn.functionName, fn.parameters.join(' '), fn.returns.join(' '), fn.source].join(' ');
          const loweredName = fn.functionName.toLowerCase();
          const hasLockMarker = LOCK_MARKERS.some((marker) => loweredName.includes(marker));
          const guarded = hasAccessControl(fn.source, fn.modifiers);
          const sensitive = containsSensitiveTerm(context);
          const isRead = fn.stateMutability === 'view' || fn.stateMutability === 'pure';
          const adminLike = /^(set|update|grant|revoke|pause|unpause|configure|approve)/i.test(fn.functionName);

          if (hasLockMarker) {
            return {
              file: fn.file,
              contractName: fn.contractName,
              functionName: fn.functionName,
              signature: fn.signature,
              currentVisibility: fn.visibility,
              recommendation: 'Locked',
              reason: 'The selector appears to be debug, deprecated or unusually dangerous and should be unavailable by default.',
              confidence: 'high',
              startLine: fn.startLine,
              endLine: fn.endLine,
            };
          }

          if (guarded || sensitive || adminLike) {
            return {
              file: fn.file,
              contractName: fn.contractName,
              functionName: fn.functionName,
              signature: fn.signature,
              currentVisibility: fn.visibility,
              recommendation: 'Restricted',
              reason: guarded
                ? 'The current contract already signals an authorization boundary; APS should preserve least-privilege access.'
                : sensitive
                  ? 'The function reads or changes semantically sensitive data and should require an explicit grant.'
                  : 'Administrative selectors should be limited to approved operators.',
              confidence: guarded || sensitive ? 'high' : 'medium',
              startLine: fn.startLine,
              endLine: fn.endLine,
            };
          }

          return {
            file: fn.file,
            contractName: fn.contractName,
            functionName: fn.functionName,
            signature: fn.signature,
            currentVisibility: fn.visibility,
            recommendation: 'Open',
            reason: isRead
              ? 'The function appears to expose non-sensitive read-only behavior intended for broad use.'
              : 'No sensitive semantics or privileged guard were detected; keep open only if permissionless access is intentional.',
            confidence: isRead ? 'medium' : 'low',
            startLine: fn.startLine,
            endLine: fn.endLine,
          };
        }),
    )
    .sort(
      (a, b) =>
        a.file.localeCompare(b.file) ||
        a.startLine - b.startLine ||
        a.signature.localeCompare(b.signature),
    );
}
