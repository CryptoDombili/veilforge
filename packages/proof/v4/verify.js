import { validateReport } from '../../analyzer/src/v4/report/schema-validation.js';
import { verifyReportIntegrity } from '../../analyzer/src/v4/report/integrity.js';
import { HASH_PAYLOAD_VERSION } from '../../analyzer/src/v4/report/report-hash.js';
import { safePath } from '../../analyzer/src/v4/report/redaction.js';
import { assertSourceFree } from './canonical.js';
import { proofError } from './errors.js';

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const SAFE_VERSION = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/u;

function fail(code, field, reason) {
  throw proofError(code, { field, reason });
}

function assertLocations(report) {
  const manifestPaths = new Set((report.inputs?.sourceManifest ?? []).map((entry) => safePath(entry.path)));
  if (!manifestPaths.size) fail('PROOF_LOCATION_UNSAFE', 'inputs.sourceManifest', 'empty');
  for (const entry of report.inputs.sourceManifest) {
    if (entry.sourceUnitId !== undefined && safePath(entry.sourceUnitId) !== safePath(entry.path)) {
      fail('PROOF_LOCATION_UNSAFE', 'inputs.sourceManifest.sourceUnitId', 'path-mismatch');
    }
  }
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Object.hasOwn(node, 'sourcePath')) {
      let path;
      try { path = safePath(node.sourcePath); } catch { fail('PROOF_LOCATION_UNSAFE', 'sourcePath', 'unsafe'); }
      if (!manifestPaths.has(path)) fail('PROOF_LOCATION_UNSAFE', 'sourcePath', 'not-in-manifest');
      for (const key of ['startByte', 'endByte', 'byteStart', 'byteEnd']) {
        if (node[key] !== undefined && (!Number.isSafeInteger(node[key]) || node[key] < 0)) {
          fail('PROOF_LOCATION_UNSAFE', key, 'invalid-byte-range');
        }
      }
      const start = node.startByte ?? node.byteStart;
      const end = node.endByte ?? node.byteEnd;
      if (start !== undefined && end !== undefined && end < start) fail('PROOF_LOCATION_UNSAFE', 'endByte', 'reversed-range');
    }
    for (const child of Object.values(node)) visit(child);
  };
  visit(report.findings);
}

function reasonCode(reason) {
  const value = typeof reason === 'string' ? reason : reason?.code ?? reason?.reasonCode ?? reason?.kind;
  return String(value ?? '').trim();
}

export function incompleteReasonCodes(report) {
  return [...new Set((report.analysis?.incompleteReasons ?? []).map(reasonCode).filter(Boolean))].sort();
}

function assertCompleteness(report) {
  const complete = report.analysis?.complete;
  const reasons = incompleteReasonCodes(report);
  if (typeof complete !== 'boolean') fail('PROOF_INCOMPLETE_INVALID', 'analysis.complete', 'required');
  if (complete && reasons.length) fail('PROOF_INCOMPLETE_INVALID', 'analysis.incompleteReasons', 'complete-with-reasons');
  if (!complete && !reasons.length) fail('PROOF_INCOMPLETE_INVALID', 'analysis.incompleteReasons', 'missing-reason');
  if (report.summary?.analysisComplete !== complete) fail('PROOF_INCOMPLETE_INVALID', 'summary.analysisComplete', 'mismatch');
  for (const finding of report.findings ?? []) {
    if (finding.incomplete === true && finding.complete === true) fail('PROOF_INCOMPLETE_INVALID', 'findings.complete', 'contradiction');
  }
}

function assertPolicy(report) {
  const status = report.policy?.evaluationStatus;
  if (!['valid', 'invalid', 'absent'].includes(status)) fail('PROOF_POLICY_INVALID', 'policy.evaluationStatus', 'unsupported');
  if (report.summary?.policyEvaluationStatus !== status) fail('PROOF_POLICY_INVALID', 'summary.policyEvaluationStatus', 'mismatch');
  if (status === 'valid' && report.policy?.valid !== true) fail('PROOF_POLICY_INVALID', 'policy.valid', 'mismatch');
  if (status === 'invalid' && report.policy?.valid !== false) fail('PROOF_POLICY_INVALID', 'policy.valid', 'mismatch');
  const policyApproved = (report.findings ?? []).filter((finding) => finding.disposition === 'policy-approved').length;
  const acceptedRisk = (report.findings ?? []).filter((finding) => finding.disposition === 'accepted-risk').length;
  if (report.summary?.policyApproved !== policyApproved || report.summary?.acceptedRisk !== acceptedRisk) {
    fail('PROOF_POLICY_INVALID', 'summary', 'disposition-count-mismatch');
  }
}

export function verifyV4ReportForProof(report) {
  let candidate;
  try { candidate = structuredClone(report); } catch { throw proofError('PROOF_SCHEMA_INVALID', { reason: 'not-cloneable' }); }
  assertSourceFree(candidate, 'PROOF_SCHEMA_INVALID', { allowReportIrStatus: true });
  try { validateReport(candidate); } catch { throw proofError('PROOF_SCHEMA_INVALID'); }
  if (candidate.schemaVersion !== '4.1.0' || candidate.reportVersion !== '4.1.0'
    || candidate.integrity?.hashPayloadVersion !== HASH_PAYLOAD_VERSION) {
    throw proofError('PROOF_VERSION_UNSUPPORTED', { version: String(candidate.reportVersion ?? '') });
  }
  if (!verifyReportIntegrity(candidate)) throw proofError('PROOF_INTEGRITY_INVALID');
  if (candidate.integrity?.verified !== true || !DIGEST.test(candidate.integrity.reportHash)) throw proofError('PROOF_INTEGRITY_INVALID');
  if (candidate.compiler?.version !== '0.8.24' || !SAFE_VERSION.test(candidate.compiler?.version ?? '')) {
    throw proofError('PROOF_COMPILER_INVALID', { version: String(candidate.compiler?.version ?? '') });
  }
  if (!SAFE_VERSION.test(candidate.scanner?.version ?? '') || !SAFE_VERSION.test(candidate.scanner?.engineVersion ?? '')) {
    throw proofError('PROOF_ANALYZER_INVALID');
  }
  if (!DIGEST.test(candidate.inputs?.sourceManifestDigest) || !DIGEST.test(candidate.compiler?.compilerDigest)) {
    throw proofError('PROOF_INTEGRITY_INVALID');
  }
  assertLocations(candidate);
  assertCompleteness(candidate);
  assertPolicy(candidate);
  return candidate;
}
