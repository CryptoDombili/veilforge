import type { Finding, ScanReport, Severity } from './types.js';

const labels: Record<Severity, string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

function formatFinding(item: Finding): string {
  return [
    `${labels[item.severity]} ${item.ruleId} — ${item.title}`,
    `${item.file}:${item.startLine}`,
    item.description,
    `Evidence: ${item.evidence}`,
    `Fix: ${item.remediation}`,
  ].join('\n');
}

export function formatTextReport(report: ScanReport): string {
  const header = [
    `VeilForge privacy readiness: ${report.score}/100 (${report.grade})`,
    `Findings: ${report.summary.critical} critical, ${report.summary.high} high, ${report.summary.medium} medium, ${report.summary.low} low`,
    `Source hash: ${report.sourceHash}`,
    `Report hash: ${report.reportHash}`,
  ].join('\n');

  const findings = report.findings.length
    ? report.findings.map(formatFinding).join('\n\n')
    : 'No findings detected by the current deterministic rule set.';

  const policies = report.policies.length
    ? report.policies
        .map((policy) => `${policy.recommendation.padEnd(10)} ${policy.signature} — ${policy.reason}`)
        .join('\n')
    : 'No externally callable functions detected.';

  return `${header}\n\n${findings}\n\nPolicy recommendations\n${policies}\n\n${report.disclaimer}`;
}
