import { createHash } from 'node:crypto';
import { verifyReport } from '../../sdk/src/exports.js';
import { canonicalSarifJson } from './canonical-json.js';
import { physicalLocation, safeArtifactUri } from './locations.js';
import { sarifError } from './errors.js';

export const SARIF_VERSION = '2.1.0';
export const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';
export const sarifPackageVersion = '4.0.0-gc.1';
const sha = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const level = (severity) => ({ critical: 'error', high: 'error', medium: 'warning', low: 'note', info: 'note', informational: 'note' }[severity] ?? 'warning');
const ruleId = (finding) => finding.detectorId ?? `${finding.domain}.${finding.category}`;
const omitted = (finding) => finding.disposition === 'not-applicable';
const suppressed = (finding) => ['accepted-risk', 'policy-approved', 'suppressed'].includes(finding.disposition) || finding.suppressionMetadata?.active === true;

function artifacts(report) {
  return [...(report.inputs?.sourceManifest ?? [])].map((source) => ({
    location: { uri: safeArtifactUri(source.path) },
    hashes: source.contentDigest?.startsWith('sha256:') ? { sha256: source.contentDigest.slice(7) } : undefined,
  })).sort((a, b) => a.location.uri.localeCompare(b.location.uri));
}
function rules(findings) {
  const map = new Map();
  for (const finding of findings) if (!omitted(finding) && !map.has(ruleId(finding))) map.set(ruleId(finding), {
    id: ruleId(finding), name: finding.category,
    shortDescription: { text: finding.title }, fullDescription: { text: finding.summary },
    defaultConfiguration: { level: level(finding.severity) },
    help: { text: [finding.explanation, ...(finding.remediationSteps ?? [])].filter(Boolean).join('\n\n') },
    properties: { detectorId: finding.detectorId ?? null, detectorVersion: finding.detectorVersion ?? null, stableRuleKey: finding.stableRuleKey ?? finding.detectorId ?? null, domain: finding.domain, category: finding.category, dataClass: finding.dataClass, sinkClass: finding.sinkClass, remediationKeys: [finding.remediationKey].filter(Boolean), tags: [finding.domain, finding.category].sort() },
  });
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}
function codeFlows(finding, artifactIndexes) {
  const steps = finding.traceView?.steps ?? [];
  if (!steps.length) return undefined;
  return [{ threadFlows: [{ locations: steps.map((step, index) => ({
    location: { physicalLocation: physicalLocation(step.location ?? finding.primaryLocation, artifactIndexes), message: { text: step.stepType ?? `Trace step ${index + 1}` } },
    executionOrder: index + 1, importance: step.valueRole === 'source' || step.valueRole === 'sink' ? 'essential' : 'important', properties: { stepType: step.stepType ?? null, valueRole: step.valueRole ?? null, boundaryMarker: step.boundaryMarker ?? null, complete: step.complete !== false },
  })), properties: { complete: finding.traceView.complete !== false, omittedStepCount: finding.traceView.omittedStepCount ?? 0, totalStepCount: finding.traceView.totalStepCount ?? steps.length } }] }];
}
function results(report, ruleIndexes, artifactIndexes) {
  return report.findings.filter((finding) => !omitted(finding)).map((finding) => {
    const primary = physicalLocation(finding.primaryLocation, artifactIndexes);
    const occurrenceSeed = [...(finding.groupedOccurrenceIds ?? [])].sort().join('|') || finding.findingId;
    const result = {
      ruleId: ruleId(finding), ruleIndex: ruleIndexes.get(ruleId(finding)), level: level(finding.severity),
      message: { text: finding.summary || finding.title }, locations: [{ physicalLocation: primary }],
      partialFingerprints: {
        primaryLocationLineHash: sha(`${primary.artifactLocation.uri}|${finding.fingerprint}`),
        'veilforge/v4/findingFingerprint': finding.fingerprint,
        'veilforge/v4/occurrenceFingerprint': sha(occurrenceSeed),
      },
      properties: {
        findingId: finding.findingId, originalSeverity: finding.severity, confidence: finding.confidence,
        disposition: finding.disposition, complete: finding.complete, occurrenceCount: finding.occurrenceCount,
        remediationKey: finding.remediationKey, remediationTitle: finding.remediationTitle,
        remediationSteps: finding.remediationSteps, unsafeWarnings: finding.unsafeRemediationWarnings,
        incompleteMessages: finding.incompleteMessages,
      },
    };
    const related = [...(finding.sourceLocations ?? []), ...(finding.sinkLocations ?? [])].filter((loc) => JSON.stringify(loc) !== JSON.stringify(finding.primaryLocation));
    if (related.length) result.relatedLocations = related.map((loc, index) => ({ id: index + 1, physicalLocation: physicalLocation(loc, artifactIndexes) }));
    const flows = codeFlows(finding, artifactIndexes); if (flows) result.codeFlows = flows;
    if (suppressed(finding)) result.suppressions = [{ kind: 'external', status: 'accepted', justification: finding.acceptedRiskMessage ?? finding.policyMessage ?? finding.suppressionMessage ?? finding.disposition }];
    return result;
  }).sort((a, b) => a.partialFingerprints['veilforge/v4/findingFingerprint'].localeCompare(b.partialFingerprints['veilforge/v4/findingFingerprint']));
}

export function renderSarif(report) {
  try { verifyReport(report); } catch (error) { throw sarifError('SARIF_REPORT_INVALID', { causeCode: error.code }); }
  const artifactList = artifacts(report); const artifactIndexes = new Map(artifactList.map((item, index) => [item.location.uri, index]));
  const ruleList = rules(report.findings); const ruleIndexes = new Map(ruleList.map((rule, index) => [rule.id, index]));
  return {
    version: SARIF_VERSION, $schema: SARIF_SCHEMA,
    runs: [{
      tool: { driver: { name: 'VeilForge', version: report.scanner?.version, semanticVersion: report.scanner?.engineVersion, rules: ruleList, properties: { engineVersion: report.scanner?.engineVersion, reportVersion: report.schemaVersion, catalogVersion: report.scanner?.catalogVersion, sarifVersion: SARIF_VERSION, reportHash: report.integrity.reportHash, sarifPackageVersion } } },
      artifacts: artifactList,
      invocations: [{ executionSuccessful: Boolean(report.analysis?.complete), exitCode: report.analysis?.complete ? 0 : 5, toolExecutionNotifications: (report.analysis?.incompleteReasons ?? []).map((reason) => ({ level: 'warning', message: { text: reason.code ?? 'Analysis incomplete' } })), properties: { analysisComplete: Boolean(report.analysis?.complete), policyStatus: report.policy?.evaluationStatus ?? null, reportIntegrityVerified: true, exportVerified: null, incompleteReasons: report.analysis?.incompleteReasons ?? [] } }],
      results: results(report, ruleIndexes, artifactIndexes),
      properties: { reportHash: report.integrity.reportHash, projectId: report.project?.projectId, canonical: true },
    }],
  };
}
export function renderSarifJson(report) { return canonicalSarifJson(renderSarif(report)); }
export function verifySarif(document, options = {}) {
  if (!document || document.version !== SARIF_VERSION) throw sarifError('SARIF_VERSION_UNSUPPORTED');
  if (document.$schema !== SARIF_SCHEMA || !Array.isArray(document.runs) || document.runs.length !== 1) throw sarifError('SARIF_SCHEMA_INVALID');
  const run = document.runs[0]; const rulesById = new Map((run.tool?.driver?.rules ?? []).map((rule, index) => [rule.id, index]));
  for (const artifact of run.artifacts ?? []) safeArtifactUri(artifact.location?.uri);
  for (const result of run.results ?? []) {
    if (!rulesById.has(result.ruleId) || rulesById.get(result.ruleId) !== result.ruleIndex) throw sarifError('SARIF_RULE_INVALID');
    if (!Array.isArray(result.locations) || result.locations.length === 0) throw sarifError('SARIF_RESULT_INVALID');
    for (const location of [...(result.locations ?? []), ...(result.relatedLocations ?? [])]) safeArtifactUri(location.physicalLocation?.artifactLocation?.uri);
    const fingerprints = result.partialFingerprints; if (!fingerprints?.primaryLocationLineHash || !fingerprints?.['veilforge/v4/findingFingerprint'] || !fingerprints?.['veilforge/v4/occurrenceFingerprint']) throw sarifError('SARIF_RESULT_INVALID');
    for (const flow of result.codeFlows ?? []) for (const thread of flow.threadFlows ?? []) for (const item of thread.locations ?? []) safeArtifactUri(item.location?.physicalLocation?.artifactLocation?.uri);
  }
  const reportHash = run.properties?.reportHash; if (options.reportHash && reportHash !== options.reportHash) throw sarifError('SARIF_INTEGRITY_MISMATCH');
  const canonical = canonicalSarifJson(document); if (options.canonicalBytes !== undefined && options.canonicalBytes !== canonical) throw sarifError('SARIF_SERIALIZATION_ERROR', { reason: 'non-canonical' });
  return Object.freeze({ verified: true, reportHash, ruleCount: rulesById.size, resultCount: (run.results ?? []).length, canonicalDigest: sha(canonical) });
}
export { canonicalSarifJson } from './canonical-json.js';
export { safeArtifactUri } from './locations.js';
export { sarifError } from './errors.js';
