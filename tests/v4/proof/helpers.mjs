import { canonicalReportBytes } from '../../../packages/analyzer/src/v4/report/canonical-json.js';
import { buildIntegrity } from '../../../packages/analyzer/src/v4/report/integrity.js';
import { calculateReportHash, reportHashPayload, sha256Digest } from '../../../packages/analyzer/src/v4/report/report-hash.js';
import { report, clone } from '../report/helpers.mjs';
import { REPORT_PUBLISHED_TOPIC, createV4ProofEnvelope, registryPayload } from '../../../packages/proof/v4/index.js';

export const ACCOUNT = '0x1111111111111111111111111111111111111111';
export const TX_HASH = `0x${'ab'.repeat(32)}`;

export function validReport(overrides = {}) { return report(overrides); }
export function validEnvelope(options = {}) { return createV4ProofEnvelope(validReport(), options); }
export function reseal(value) { buildIntegrity(value); return value; }

export function incompleteReport() {
  return report({ analysis: { statuses: { frontend: 'complete', ir: 'incomplete' }, incompleteReasons: ['unsupported-expression'] } });
}

export function legacyReport() {
  const value = clone(validReport());
  value.schemaVersion = '4.0.0';
  value.reportVersion = '4.0.0';
  value.scanner.reportSchemaVersion = '4.0.0';
  value.integrity.hashPayloadVersion = 'veilforge.report.hash.v1';
  value.integrity.canonicalByteLength = canonicalReportBytes(reportHashPayload(value)).length;
  value.integrity.sourceManifestDigest = value.inputs.sourceManifestDigest;
  value.integrity.compilerDigest = value.compiler.compilerDigest;
  value.integrity.policyDigest = value.policy.policyDigest;
  value.integrity.findingsDigest = sha256Digest(value.findings);
  value.integrity.summaryDigest = sha256Digest(value.summary);
  value.integrity.reportHash = calculateReportHash(value);
  value.integrity.verified = true;
  return value;
}

function padWord(hex) { return hex.padStart(64, '0'); }
function stringTail(value) {
  const body = Buffer.from(value, 'utf8').toString('hex');
  return `${padWord((body.length / 2).toString(16))}${body.padEnd(Math.ceil(body.length / 64) * 64, '0')}`;
}

export function reportPublishedLog(envelope, { account = ACCOUNT, scannerVersion, reportURI = '', address = envelope.registryAddress } = {}) {
  const payload = registryPayload(envelope, reportURI);
  const scanner = scannerVersion ?? payload.scannerVersion;
  const scannerTail = stringTail(scanner);
  const uriTail = stringTail(reportURI);
  const scannerOffset = 128;
  const uriOffset = scannerOffset + scannerTail.length / 2;
  const data = `0x${[
    padWord(payload.score.toString(16)), padWord(scannerOffset.toString(16)), padWord(uriOffset.toString(16)),
    padWord(account.slice(2).toLowerCase()), scannerTail, uriTail,
  ].join('')}`;
  return {
    address,
    topics: [
      REPORT_PUBLISHED_TOPIC,
      payload.projectId, payload.sourceHash, payload.reportHash,
    ],
    data,
  };
}

export function validReceipt(envelope, overrides = {}) {
  return {
    status: '0x1', transactionHash: TX_HASH, blockNumber: '0x10', from: ACCOUNT,
    logs: [reportPublishedLog(envelope)], ...overrides,
  };
}

export function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
    entries: () => [...map.entries()],
  };
}
