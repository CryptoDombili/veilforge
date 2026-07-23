function escapeTable(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

export function formatTextReport(report) {
  const lines = [
    `VeilForge Privacy Mission Control v${report.scannerVersion}`,
    `Status: ${report.status}`,
    `Readiness: ${report.score}/100 (${report.grade})`,
    `Findings: ${report.summary.critical} critical, ${report.summary.high} high, ${report.summary.medium} medium, ${report.summary.low} low`,
    `Contracts: ${report.contracts.length}`,
    `Source hash: ${report.sourceHash}`,
    `Report hash: ${report.reportHash}`,
    '',
  ];

  for (const finding of report.findings) {
    lines.push(
      `${finding.priority} ${finding.severity.toUpperCase()} ${finding.ruleId} — ${finding.title}`,
      `${finding.file}:${finding.startLine} (${finding.contractName})`,
      `Impact: ${finding.impact}`,
      `Action: ${finding.remediation}`,
      `Policy: ${finding.suggestedPolicy}`,
      '',
    );
  }

  if (report.findings.length === 0) lines.push('No finding matched the current deterministic rule set.', '');
  lines.push(report.disclaimer);
  return lines.join('\n');
}

export function formatMarkdownReport(report, projectName = 'Solidity project') {
  const contractRows = report.contracts.length
    ? report.contracts.map((contract) => `| ${escapeTable(contract.name)} | ${contract.score}/100 | ${contract.status} | ${contract.summary.critical} | ${contract.summary.high} |`).join('\n')
    : '| — | — | Review Required | — | — |';

  const findingSections = report.findings.length
    ? report.findings.map((finding) => `## ${finding.priority} · ${finding.ruleId} — ${finding.title}\n\n` +
      `- **Severity:** ${finding.severity.toUpperCase()}\n` +
      `- **Contract:** ${finding.contractName}\n` +
      `- **Location:** \`${finding.file}:${finding.startLine}-${finding.endLine}\`\n` +
      `- **Confidence:** ${finding.confidence}\n` +
      `- **Suggested policy:** ${finding.suggestedPolicy}\n\n` +
      `### Impact\n\n${finding.impact}\n\n` +
      `### Evidence\n\n\`\`\`solidity\n${finding.evidence}\n\`\`\`\n\n` +
      `### Treatment\n\n${finding.remediation}\n\n` +
      (finding.saferPattern ? `### Safer pattern\n\n\`\`\`solidity\n${finding.saferPattern}\n\`\`\`\n` : '')).join('\n---\n\n')
    : 'No deterministic rule matched. Continue manual review; VeilForge is not a formal security audit.';

  const policyRows = report.policies.length
    ? report.policies.map((policy) => `| \`${policy.selector}\` | \`${escapeTable(policy.signature)}\` | ${policy.recommendation} | ${escapeTable(policy.reason)} |`).join('\n')
    : '| — | — | — | No externally callable selector detected. |';

  return `# ${projectName} — VeilForge v${report.scannerVersion} Privacy Readiness Report\n\n` +
    `> ${report.disclaimer}\n\n` +
    `## Mission summary\n\n` +
    `| Metric | Value |\n|---|---:|\n` +
    `| Deployment status | **${report.status}** |\n` +
    `| Privacy readiness | **${report.score}/100 (${report.grade})** |\n` +
    `| Critical findings | ${report.summary.critical} |\n` +
    `| High findings | ${report.summary.high} |\n` +
    `| Exposure chains | ${report.exposureChains.length} |\n` +
    `| Sensitive selectors | ${report.exposure.sensitiveSelectors} |\n\n` +
    `- **Source hash:** \`${report.sourceHash}\`\n` +
    `- **Report hash:** \`${report.reportHash}\`\n\n` +
    `## Contract triage\n\n| Contract | Score | Status | Critical | High |\n|---|---:|---|---:|---:|\n${contractRows}\n\n` +
    `## Treatment Plan 2.0\n\n${findingSections}\n\n` +
    `## Arc policy manifest preview\n\n| Selector | Signature | Policy | Reason |\n|---|---|---|---|\n${policyRows}\n`;
}
