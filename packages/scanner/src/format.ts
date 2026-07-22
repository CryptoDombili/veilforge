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
    `Impact: ${item.impact}`,
    `Evidence: ${item.evidence}`,
    `Fix: ${item.remediation}`,
    `Suggested policy: ${item.suggestedPolicy}`,
  ].join('\n');
}

export function formatTextReport(report: ScanReport): string {
  const header = [
    `VeilForge privacy readiness: ${report.score}/100 (${report.grade})`,
    `Triage: ${report.triage.status}`,
    `Analysis: ${report.analysisProfile.execution}, ${report.analysisProfile.hashAlgorithm}, AI API used: ${report.analysisProfile.aiApiUsed ? 'yes' : 'no'}`,
    `Deployment allowed: ${report.triage.deploymentAllowed ? 'yes' : 'no'}`,
    `Contracts: ${report.contracts.length}`,
    `Findings: ${report.summary.critical} critical, ${report.summary.high} high, ${report.summary.medium} medium, ${report.summary.low} low`,
    `Exposure chains: ${report.exposureChains.length}`,
    `Sensitive selectors: ${report.exposure.sensitiveSelectors}`,
    `Externally callable functions: ${report.exposure.externallyCallableFunctions}`,
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

function escapeTable(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

export function formatTreatmentPlanMarkdown(report: ScanReport): string {
  if (report.treatmentPlan.length === 0) {
    return 'No deterministic treatment actions were generated. Continue manual review.';
  }

  return report.treatmentPlan
    .map(
      (item) =>
        `## ${item.order}. ${item.priority} — ${item.title}\n\n` +
        `- **Rule:** ${item.ruleId}\n` +
        `- **Severity:** ${labels[item.severity]}\n` +
        `- **Contract:** ${item.contractName}\n` +
        `- **Location:** \`${item.file}:${item.startLine}-${item.endLine}\`\n` +
        `- **Suggested policy:** ${item.suggestedPolicy}\n\n` +
        `### Action\n\n${item.action}\n\n` +
        `### Expected outcome\n\n${item.expectedOutcome}\n`,
    )
    .join('\n---\n\n');
}

export function formatMarkdownReport(report: ScanReport, projectName = 'VeilForge scan'): string {
  const findings = report.findings.length
    ? report.findings
        .map(
          (item) =>
            `## ${item.ruleId} — ${item.title}\n\n` +
            `- **Severity:** ${labels[item.severity]}\n` +
            `- **Category:** ${item.category}\n` +
            `- **Location:** \`${item.file}:${item.startLine}-${item.endLine}\`\n` +
            `- **Confidence:** ${item.confidence}\n` +
            `- **Suggested APS policy:** ${item.suggestedPolicy}\n\n` +
            `### Why it matters\n\n${item.impact}\n\n` +
            `### Evidence\n\n\`\`\`solidity\n${item.evidence}\n\`\`\`\n\n` +
            `### Recommended remediation\n\n${item.remediation}\n\n` +
            (item.saferPattern
              ? `### Safer pattern\n\n\`\`\`solidity\n${item.saferPattern}\n\`\`\`\n`
              : ''),
        )
        .join('\n---\n\n')
    : 'No deterministic rule matched. Continue manual review; this is not a formal security audit.';

  const contractRows = report.contracts.length
    ? report.contracts
        .map(
          (contract) =>
            `| ${escapeTable(contract.contractName)} | \`${escapeTable(contract.file)}\` | ${contract.score}/100 | ${contract.status} | ${contract.findingCount} |`,
        )
        .join('\n')
    : '| — | — | — | — | No contracts parsed. |';

  const policyRows = report.policies.length
    ? report.policies
        .map(
          (policy) =>
            `| \`${escapeTable(policy.signature)}\` | ${policy.recommendation} | ${escapeTable(policy.reason)} |`,
        )
        .join('\n')
    : '| — | — | No externally callable functions detected. |';

  const chainRows = report.exposureChains.length
    ? report.exposureChains
        .slice(0, 20)
        .map(
          (chain) =>
            `| ${escapeTable(chain.title)} | ${labels[chain.severity]} | ${escapeTable(chain.nodes.map((item) => item.label).join(' → '))} |`,
        )
        .join('\n')
    : '| — | — | No deterministic exposure chain generated. |';

  return (
    `# ${projectName} — VeilForge Privacy Mission Control Report\n\n` +
    `> Generated by VeilForge v${report.scannerVersion}. ${report.disclaimer}\n\n` +
    `## Executive triage\n\n` +
    `| Metric | Value |\n|---|---:|\n` +
    `| Privacy readiness | **${report.score}/100 (${report.grade})** |\n` +
    `| Analysis profile | ${report.analysisProfile.execution} · ${report.analysisProfile.hashAlgorithm} · AI API: none |\n` +
    `| Triage status | **${report.triage.status}** |\n` +
    `| Deployment allowed | **${report.triage.deploymentAllowed ? 'Yes' : 'No'}** |\n` +
    `| Contracts analyzed | ${report.contracts.length} |\n` +
    `| Critical findings | ${report.summary.critical} |\n` +
    `| High findings | ${report.summary.high} |\n` +
    `| Exposure chains | ${report.exposureChains.length} |\n` +
    `| Sensitive selectors | ${report.exposure.sensitiveSelectors} |\n\n` +
    `${report.triage.explanation}\n\n` +
    `- **Source hash:** \`${report.sourceHash}\`\n` +
    `- **Report hash:** \`${report.reportHash}\`\n\n` +
    `## Contract triage\n\n` +
    `| Contract | File | Score | Status | Findings |\n|---|---|---:|---|---:|\n${contractRows}\n\n` +
    `## Deterministic exposure chains\n\n` +
    `| Path | Severity | Observed flow |\n|---|---|---|\n${chainRows}\n\n` +
    `## Prioritized findings\n\n${findings}\n\n` +
    `# Treatment plan\n\n${formatTreatmentPlanMarkdown(report)}\n\n` +
    `## APS-aligned selector recommendations\n\n` +
    `| Selector | Policy | Reason |\n|---|---|---|\n${policyRows}\n`
  );
}
