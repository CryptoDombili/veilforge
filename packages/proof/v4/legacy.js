import { validateReport } from '../../analyzer/src/v4/report/schema-validation.js';
import { verifyReportIntegrity } from '../../analyzer/src/v4/report/integrity.js';
import { LEGACY_HASH_PAYLOAD_VERSION } from '../../analyzer/src/v4/report/report-hash.js';
import { proofError } from './errors.js';
import { PROOF_ENVELOPE_VERSION, verifyV4ProofEnvelope } from './envelope.js';

const HEX32 = /^0x[0-9a-fA-F]{64}$/u;

export function detectProofVersion(value) {
  if (value?.envelopeVersion === PROOF_ENVELOPE_VERSION) return 'v4';
  if (value?.schema === 'veilforge.report.v4' && value?.schemaVersion === '4.0.0'
    && value?.integrity?.hashPayloadVersion === LEGACY_HASH_PAYLOAD_VERSION) return 'v4-report-legacy';
  if (typeof value?.version === 'string' && /^3(?:\.|-)/u.test(value.version)) return 'v3-legacy';
  if (value && typeof value === 'object' && 'projectId' in value && 'sourceHash' in value && 'reportHash' in value) return 'v3-registry-legacy';
  throw proofError('PROOF_VERSION_UNSUPPORTED');
}

export function verifyLegacyProof(proof) {
  const version = detectProofVersion(proof);
  if (version === 'v4') return verifyV4ProofEnvelope(proof);
  if (version === 'v4-report-legacy') {
    let candidate;
    try { candidate = structuredClone(proof); validateReport(candidate); } catch { throw proofError('PROOF_LEGACY_INVALID'); }
    if (!verifyReportIntegrity(candidate)) throw proofError('PROOF_LEGACY_INVALID');
    return true;
  }
  if (version === 'v3-registry-legacy') {
    if (!HEX32.test(proof.projectId) || !HEX32.test(proof.sourceHash) || !HEX32.test(proof.reportHash)
      || !Number.isInteger(Number(proof.score)) || Number(proof.score) < 0 || Number(proof.score) > 100
      || typeof proof.scannerVersion !== 'string' || !proof.scannerVersion.trim()) throw proofError('PROOF_LEGACY_INVALID');
    return true;
  }
  if (version === 'v3-legacy') {
    if (!HEX32.test(proof.proofId) || !HEX32.test(proof.reportHash) || typeof proof.version !== 'string') {
      throw proofError('PROOF_LEGACY_INVALID');
    }
    return true;
  }
  throw proofError('PROOF_LEGACY_INVALID');
}
