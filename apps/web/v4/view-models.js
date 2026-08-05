import { cloneValue, deepFreeze } from './canonical.js';
import { webV4Error } from './errors.js';

const LEGACY_ONLY = Object.freeze([
  'privacyGenome', 'privacyIntent', 'attackLab', 'transactionMRI', 'forgePlan',
  'privacyTwin', 'deploymentLineage', 'privacyPassport', 'arcDeployRehearsal', 'proofPublication',
]);

const location = (value) => value ? Object.freeze({
  sourcePath: value.sourcePath,
  startLine: value.startLine ?? null,
  startColumn: value.startColumn ?? null,
  endLine: value.endLine ?? null,
  endColumn: value.endColumn ?? null,
  startByte: value.startByte ?? value.byteStart ?? null,
  endByte: value.endByte ?? value.byteEnd ?? null,
}) : null;

export function createV4ViewModel(verification, options = {}) {
  if (verification?.verified !== true || !verification.report) throw webV4Error('WEB_V4_REPORT_UNVERIFIED', 'A verified V4 report is required before rendering.');
  const report = verification.report;
  const findings = report.findings.map((finding) => ({
    findingId: finding.findingId,
    detectorId: finding.detectorId,
    domain: finding.domain,
    sourceClass: finding.dataClass ?? finding.sourceClass,
    sinkClass: finding.sinkClass,
    severity: finding.severity,
    confidence: finding.confidence,
    disposition: finding.disposition,
    title: finding.title,
    summary: finding.summary,
    occurrenceCount: finding.occurrenceCount,
    primaryLocation: location(finding.primaryLocation),
    relatedLocations: [...(finding.sourceLocations ?? []), ...(finding.sinkLocations ?? [])].map(location),
    evidence: cloneValue(finding.evidenceView ?? []),
    trace: cloneValue(finding.traceView ?? { steps: [], complete: finding.complete !== false }),
    incomplete: finding.incomplete === true,
    incompleteMessages: [...(finding.incompleteMessages ?? [])],
  })).sort((left, right) => left.detectorId.localeCompare(right.detectorId) || left.findingId.localeCompare(right.findingId));
  return deepFreeze({
    kind: 'veilforge-v4-view-model',
    projectId: report.project?.projectId ?? null,
    reportHash: verification.reportHash,
    summary: cloneValue(report.summary),
    analysis: { complete: report.analysis?.complete === true, statuses: cloneValue(report.analysis?.statuses ?? {}), incompleteReasons: cloneValue(report.analysis?.incompleteReasons ?? []) },
    policy: { present: report.policy?.present === true, valid: report.policy?.valid === true, status: report.policy?.evaluationStatus ?? 'unknown' },
    findings,
    integrity: { verified: true, hashPayloadVersion: report.integrity.hashPayloadVersion, reportHash: report.integrity.reportHash },
    exportAvailable: true,
    gate: options.gate ? cloneValue(options.gate) : null,
    legacyModules: Object.fromEntries(LEGACY_ONLY.map((name) => [name, Object.freeze({ status: 'legacy-only', reason: 'unavailable-in-v4' })])),
  });
}
