import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getExportFile, verifyExportPackage, verifyReport } from '../../sdk/src/exports.js';

export const GATE_EXIT_CODES = Object.freeze({ PASSED: 0, CONFIG_INVALID: 2, REPORT_INVALID: 8, EXPORT_INVALID: 9, INTERNAL_ERROR: 11, GATE_FAILED: 12 });
const SEVERITIES = Object.freeze(['informational', 'info', 'low', 'medium', 'high', 'critical']);
const CONFIDENCES = Object.freeze(['low', 'medium', 'high']);
const DISPOSITIONS = Object.freeze(['detected', 'incomplete', 'accepted-risk', 'policy-approved', 'suppressed', 'not-applicable']);
const ALLOWED = new Set(['schemaVersion', 'failOnSeverity', 'minimumConfidence', 'includedDomains', 'includedCategories', 'excludedRuleIds', 'dispositions', 'failOnIncomplete', 'failOnInvalidPolicy', 'maxActiveFindings', 'maxFindingsBySeverity', 'baseline']);
export const DEFAULT_GATE_CONFIG = Object.freeze({ schemaVersion: '1.0.0', failOnSeverity: Object.freeze(['critical', 'high']), minimumConfidence: 'low', includedDomains: Object.freeze([]), includedCategories: Object.freeze([]), excludedRuleIds: Object.freeze([]), dispositions: Object.freeze(['detected']), failOnIncomplete: true, failOnInvalidPolicy: true, maxActiveFindings: null, maxFindingsBySeverity: Object.freeze({}), baseline: null });
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])); return value; }
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
function configError(reason) { const error = new Error('The gate configuration is invalid.'); error.name = 'VeilForgeGateError'; error.code = 'GATE_CONFIG_INVALID'; error.safeDetails = Object.freeze({ reason }); return error; }
function strings(value, name) { if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item)) throw configError(name); return [...new Set(value)].sort(); }
function normalizeConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw configError('object-required');
  for (const key of Object.keys(input)) if (!ALLOWED.has(key)) throw configError(`unknown-${key}`);
  const result = { ...DEFAULT_GATE_CONFIG, ...input };
  if (result.schemaVersion !== '1.0.0') throw configError('schemaVersion');
  result.failOnSeverity = strings(result.failOnSeverity, 'failOnSeverity'); if (result.failOnSeverity.some((item) => !SEVERITIES.includes(item))) throw configError('failOnSeverity');
  if (!CONFIDENCES.includes(result.minimumConfidence)) throw configError('minimumConfidence');
  result.dispositions = strings(result.dispositions, 'dispositions'); if (result.dispositions.some((item) => !DISPOSITIONS.includes(item))) throw configError('dispositions');
  result.includedDomains = strings(result.includedDomains, 'includedDomains'); result.includedCategories = strings(result.includedCategories, 'includedCategories'); result.excludedRuleIds = strings(result.excludedRuleIds, 'excludedRuleIds');
  if (result.maxActiveFindings !== null && (!Number.isInteger(result.maxActiveFindings) || result.maxActiveFindings < 0)) throw configError('maxActiveFindings');
  if (!result.maxFindingsBySeverity || typeof result.maxFindingsBySeverity !== 'object' || Array.isArray(result.maxFindingsBySeverity)) throw configError('maxFindingsBySeverity');
  for (const [key, count] of Object.entries(result.maxFindingsBySeverity)) if (!SEVERITIES.includes(key) || !Number.isInteger(count) || count < 0) throw configError('maxFindingsBySeverity');
  if (typeof result.failOnIncomplete !== 'boolean' || typeof result.failOnInvalidPolicy !== 'boolean') throw configError('boolean');
  if (result.baseline !== null && (typeof result.baseline !== 'object' || result.baseline.mode !== 'new-only')) throw configError('baseline');
  return stable(result);
}
export async function loadGateConfig(input) { if (input === undefined || input === null) return normalizeConfig(); if (typeof input === 'string') { try { return normalizeConfig(JSON.parse(await readFile(input, 'utf8'))); } catch (error) { if (error.code === 'GATE_CONFIG_INVALID') throw error; throw configError('unreadable'); } } return normalizeConfig(input); }
function baselineState(baseline, current) {
  if (!baseline) return { fingerprints: new Set(), disappeared: [] };
  let values;
  if (Array.isArray(baseline.fingerprints)) values = strings(baseline.fingerprints, 'baseline.fingerprints');
  else if (baseline.report) { try { verifyReport(baseline.report); } catch { throw configError('baseline-report-invalid'); } values = baseline.report.findings.map((finding) => finding.fingerprint); }
  else throw configError('baseline-source');
  const currentSet = new Set(current.map((finding) => finding.fingerprint)); return { fingerprints: new Set(values), disappeared: values.filter((item) => !currentSet.has(item)).sort() };
}
const invalidPolicy = (report) => report.policy?.evaluationStatus === 'invalid' || report.policy?.valid === false;
const ruleId = (finding) => `${finding.domain}.${finding.category}`;
const effectiveDisposition = (finding) => finding.suppressionMetadata?.kind === 'explicit' && finding.suppressionMetadata?.active === true ? 'suppressed' : finding.disposition;
export async function evaluateGate(report, inputConfig = {}) {
  try { verifyReport(report); } catch (cause) { const error = new Error('The gate report is invalid.'); error.code = 'GATE_REPORT_INVALID'; error.cause = cause; throw error; }
  const config = await loadGateConfig(inputConfig); const baseline = baselineState(config.baseline, report.findings); const confidenceMinimum = CONFIDENCES.indexOf(config.minimumConfidence);
  const matched = report.findings.filter((finding) => config.dispositions.includes(effectiveDisposition(finding)) && config.failOnSeverity.includes(finding.severity) && CONFIDENCES.indexOf(finding.confidence) >= confidenceMinimum && (!config.includedDomains.length || config.includedDomains.includes(finding.domain)) && (!config.includedCategories.length || config.includedCategories.includes(finding.category)) && !config.excludedRuleIds.includes(ruleId(finding)) && !baseline.fingerprints.has(finding.fingerprint));
  const reasons = []; if (matched.length) reasons.push({ code: 'ACTIVE_FINDINGS', count: matched.length });
  if (config.maxActiveFindings !== null && matched.length > config.maxActiveFindings) reasons.push({ code: 'MAX_ACTIVE_FINDINGS', count: matched.length, maximum: config.maxActiveFindings });
  for (const severity of SEVERITIES) { const count = matched.filter((finding) => finding.severity === severity).length; const maximum = config.maxFindingsBySeverity[severity]; if (maximum !== undefined && count > maximum) reasons.push({ code: 'MAX_FINDINGS_BY_SEVERITY', severity, count, maximum }); }
  const incompleteReasons = [...(report.analysis?.incompleteReasons ?? [])]; if (config.failOnIncomplete && report.analysis?.complete === false) reasons.push({ code: 'ANALYSIS_INCOMPLETE', count: incompleteReasons.length }); if (config.failOnInvalidPolicy && invalidPolicy(report)) reasons.push({ code: 'POLICY_INVALID' });
  const passed = reasons.length === 0; const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, matched.filter((finding) => finding.severity === severity).length]));
  const decision = passed ? 'allow' : 'deny'; const summary = `${decision}:${matched.length}:${incompleteReasons.length}:${reasons.map((item) => item.code).join(',')}`;
  const projection = (finding) => ({ findingId: finding.findingId, fingerprint: finding.fingerprint, ruleId: ruleId(finding), severity: finding.severity, confidence: finding.confidence, disposition: effectiveDisposition(finding) });
  return Object.freeze(stable({ gateVersion: '4.0.0-gc.1', passed, status: passed ? 'passed' : 'failed', decision, exitCode: passed ? 0 : 12, matchedFindings: matched.map(projection), visibleFindings: report.findings.map(projection), counts: { evaluated: report.findings.length, active: matched.length, bySeverity: counts, byDisposition: Object.fromEntries(DISPOSITIONS.map((item) => [item, report.findings.filter((finding) => effectiveDisposition(finding) === item).length])), baselineExisting: report.findings.filter((finding) => baseline.fingerprints.has(finding.fingerprint)).length, baselineDisappeared: baseline.disappeared.length }, reasons, incompleteReasons, configDigest: digest({ ...config, baseline: config.baseline ? { mode: 'new-only', fingerprints: [...baseline.fingerprints].sort() } : null }), reportHash: report.integrity.reportHash, deterministicSummary: summary, baseline: { mode: config.baseline?.mode ?? null, existingFingerprints: report.findings.filter((finding) => baseline.fingerprints.has(finding.fingerprint)).map((finding) => finding.fingerprint).sort(), disappearedFingerprints: baseline.disappeared } }));
}
export async function evaluateExportGate(pkg, config = {}) { try { verifyExportPackage(pkg); } catch (cause) { const error = new Error('The gate export is invalid.'); error.code = 'GATE_EXPORT_INVALID'; error.cause = cause; throw error; } return evaluateGate(JSON.parse(getExportFile(pkg, 'veilforge-report-v4.json')), config); }
export function getGateExitCode(item) { if (item?.passed === true) return 0; if (item?.passed === false) return 12; return ({ GATE_CONFIG_INVALID: 2, GATE_REPORT_INVALID: 8, GATE_EXPORT_INVALID: 9 }[item?.code] ?? 11); }
export { configError as gateConfigError };
