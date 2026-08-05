export function terminalSummary(summary) {
  const findings = summary.findingSummary ?? {};
  return [
    'VeilForge V4', `Project: ${summary.projectId}`, `Status: ${summary.status}`,
    `Findings: ${findings.active ?? findings.detected ?? 0} active, ${findings.incomplete ?? 0} incomplete`,
    `Integrity: ${summary.reportHash ? 'verified' : 'unavailable'}`,
    summary.outputDirectory ? `Export: ${summary.outputDirectory}` : 'Export: disabled',
  ].join('\n') + '\n';
}
