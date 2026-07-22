import {
  formatMarkdownReport,
  formatTreatmentPlanMarkdown,
  generatePolicyManifest,
  type ScanReport,
  type SourceFile,
} from '@veilforge/scanner';
import { ARC_TESTNET, ARC_TESTNET_REGISTRY_ADDRESS } from '@veilforge/shared';
import { createDeterministicZip } from './zip';

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadText(content: string, type: string, fileName: string): void {
  downloadBlob(new Blob([content], { type }), fileName);
}

export function artifactPrefix(projectName: string, report: ScanReport): string {
  const safeName = projectName.trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');
  return `${safeName || 'veilforge-scan'}-${report.reportHash.slice(2, 10)}`;
}

export function downloadJsonReport(report: ScanReport, projectName: string): void {
  downloadText(
    `${JSON.stringify(report, null, 2)}\n`,
    'application/json',
    `${artifactPrefix(projectName, report)}-report.json`,
  );
}

export function downloadMarkdownReport(report: ScanReport, projectName: string): void {
  downloadText(
    formatMarkdownReport(report, projectName || 'VeilForge scan'),
    'text/markdown',
    `${artifactPrefix(projectName, report)}-report.md`,
  );
}

export function downloadPolicyManifest(report: ScanReport, projectName: string): void {
  downloadText(
    `${JSON.stringify(generatePolicyManifest(report), null, 2)}\n`,
    'application/json',
    `${artifactPrefix(projectName, report)}-arc-policy.json`,
  );
}

export function downloadRemediationPack(
  report: ScanReport,
  projectName: string,
  sources: SourceFile[],
): void {
  const prefix = artifactPrefix(projectName, report);
  const proofPayload = {
    network: ARC_TESTNET.name,
    chainId: ARC_TESTNET.id,
    registry: ARC_TESTNET_REGISTRY_ADDRESS,
    sourceHash: report.sourceHash,
    reportHash: report.reportHash,
    score: report.score,
    scannerVersion: report.scannerVersion,
    storesSourceCode: false,
  };
  const entries = [
    {
      name: 'README.txt',
      content:
        `VeilForge v${report.scannerVersion} Remediation Pack\n\n` +
        `Project: ${projectName}\n` +
        `Readiness: ${report.score}/100 (${report.grade})\n` +
        `Triage: ${report.triage.status}\n` +
        `Source hash: ${report.sourceHash}\n` +
        `Report hash: ${report.reportHash}\n\n` +
        'All analysis was generated locally by deterministic rules. Review and test every suggested pattern before deployment.\n',
    },
    { name: 'report/veilforge-report.json', content: `${JSON.stringify(report, null, 2)}\n` },
    { name: 'report/veilforge-report.md', content: formatMarkdownReport(report, projectName) },
    { name: 'report/treatment-plan.md', content: formatTreatmentPlanMarkdown(report) },
    {
      name: 'report/exposure-chains.json',
      content: `${JSON.stringify(report.exposureChains, null, 2)}\n`,
    },
    {
      name: 'arc/arc-policy-manifest.json',
      content: `${JSON.stringify(generatePolicyManifest(report), null, 2)}\n`,
    },
    { name: 'arc/proof-payload.json', content: `${JSON.stringify(proofPayload, null, 2)}\n` },
    ...sources.map((source) => ({ name: `source/${source.path}`, content: source.content })),
  ];
  downloadBlob(createDeterministicZip(entries), `${prefix}-remediation-pack.zip`);
}
