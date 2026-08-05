import { canonicalJson, cloneValue, deepFreeze, sha256Digest, utf8Bytes } from './canonical.js';
import { webV4Error } from './errors.js';
import { V4_HASH_PAYLOAD_VERSION, V4_REPORT_SCHEMA, V4_REPORT_VERSION } from './version.js';

const REQUIRED = ['schema', 'schemaVersion', 'reportVersion', 'scanner', 'project', 'scan', 'compiler', 'inputs', 'analysis', 'policy', 'summary', 'findings', 'integrity', 'extensions'];
const DETECTOR_ID = /^arc-(?:payments|treasury|private-credit)\.[a-z0-9-]+$/u;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

export function safeSourcePath(value) {
  const path = String(value ?? '');
  if (!path || path.includes('\0') || path.includes('\\') || /^(?:\/|[A-Za-z]:|[a-z][a-z0-9+.-]*:)/iu.test(path)) return false;
  return !path.split('/').some((part) => !part || part === '.' || part === '..');
}

function assertLocations(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  const locationPath = value.sourcePath ?? (('startLine' in value || 'startByte' in value || 'byteStart' in value) ? value.path : undefined);
  if (locationPath !== undefined && !safeSourcePath(locationPath)) throw webV4Error('WEB_V4_LOCATION_UNSAFE', 'V4 report contains an unsafe source location.');
  for (const item of Object.values(value)) assertLocations(item, seen);
}

function reportHashPayload(report) {
  const value = cloneValue(report);
  if (value.scan) delete value.scan.operational;
  if (value.integrity) {
    delete value.integrity.reportHash;
    delete value.integrity.verified;
    delete value.integrity.signature;
    delete value.integrity.transactionHash;
  }
  if (value.extensions) delete value.extensions.uiState;
  return value;
}

function assertShape(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw webV4Error('WEB_V4_REPORT_INVALID', 'A V4 report object is required.');
  if (REQUIRED.some((key) => !(key in report))) throw webV4Error('WEB_V4_REPORT_INVALID', 'V4 report is missing a required section.');
  if (report.schema !== V4_REPORT_SCHEMA || report.schemaVersion !== V4_REPORT_VERSION || report.reportVersion !== V4_REPORT_VERSION) throw webV4Error('WEB_V4_REPORT_INVALID', 'Only V4 report schema 4.1.0 is supported.');
  if (!Array.isArray(report.findings)) throw webV4Error('WEB_V4_REPORT_INVALID', 'V4 findings must be an array.');
  for (const finding of report.findings) {
    if (!DETECTOR_ID.test(finding.detectorId ?? '') || finding.stableRuleKey !== finding.detectorId) throw webV4Error('WEB_V4_REPORT_INVALID', 'Every V4 finding requires a stable detector ID.');
  }
  const integrity = report.integrity;
  if (integrity?.hashAlgorithm !== 'sha256' || integrity?.hashPayloadVersion !== V4_HASH_PAYLOAD_VERSION || !DIGEST.test(integrity?.reportHash ?? '')) throw webV4Error('WEB_V4_REPORT_INVALID', 'V4 integrity envelope is invalid.');
  assertLocations(report.findings);
}

export async function verifyV4Report(report) {
  assertShape(report);
  const value = cloneValue(report);
  const integrity = value.integrity;
  const payload = reportHashPayload(value);
  const checks = await Promise.all([
    sha256Digest(payload), sha256Digest(value.findings), sha256Digest(value.summary),
  ]);
  const valid = checks[0] === integrity.reportHash
    && utf8Bytes(canonicalJson(payload)).byteLength === integrity.canonicalByteLength
    && checks[1] === integrity.findingsDigest
    && checks[2] === integrity.summaryDigest
    && integrity.sourceManifestDigest === value.inputs?.sourceManifestDigest
    && integrity.compilerDigest === value.compiler?.compilerDigest
    && integrity.policyDigest === value.policy?.policyDigest;
  if (!valid) throw webV4Error('WEB_V4_REPORT_UNVERIFIED', 'V4 report integrity verification failed.');
  value.integrity.verified = true;
  return deepFreeze({ verified: true, reportHash: integrity.reportHash, report: value });
}
