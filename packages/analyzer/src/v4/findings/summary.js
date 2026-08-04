import { compare } from '../classification/common.js';

function counts(findings, key) { const result = {}; for (const finding of findings) { const value = finding[key]; result[value] = (result[value] ?? 0) + 1; } return Object.fromEntries(Object.entries(result).sort(([a], [b]) => compare(a, b))); }

export function summarizeFindings(findings) {
  return {
    totalFindings: findings.length,
    activeDetected: findings.filter((item) => item.disposition === 'detected' && !item.suppression.active).length,
    policyApproved: findings.filter((item) => item.disposition === 'policy-approved').length,
    acceptedRisk: findings.filter((item) => item.disposition === 'accepted-risk').length,
    incomplete: findings.filter((item) => item.disposition === 'incomplete').length,
    informationalObservations: findings.filter((item) => item.category === 'calldata-observation').length,
    severityCounts: counts(findings, 'severity'), confidenceCounts: counts(findings, 'confidence'),
    domainCounts: counts(findings, 'domain'), categoryCounts: counts(findings, 'category'),
    uniqueOccurrenceCount: new Set(findings.flatMap((item) => item.groupedOccurrenceIds)).size,
    groupedFindingCount: findings.length,
  };
}
