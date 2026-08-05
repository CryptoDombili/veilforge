import { encodePublishReport } from '../src/registry.js';
import { digestToBytes32, proofDigest } from './canonical.js';
import { verifyV4ProofEnvelope } from './envelope.js';
import { proofError } from './errors.js';
import { assertTrustedNetwork, checksumAddress } from './network.js';
import { verifyRegistryRecord } from './receipt.js';

export const REGISTRY_PROJECT_NAMESPACE = 'veilforge.registry.project.v1';
export const REGISTRY_SCORE = 0;
export const REGISTRY_SCORE_MEANING = 'legacy-abi-neutral';

export function registryProjectId(projectId) {
  const value = String(projectId ?? '').normalize('NFC').trim();
  if (!value || value.length > 256) throw proofError('PROOF_ENVELOPE_INVALID', { field: 'projectId' });
  return digestToBytes32(proofDigest({ namespace: REGISTRY_PROJECT_NAMESPACE, projectId: value }), 'projectId');
}

export function registryScannerVersion(envelope) {
  const value = `${envelope.productVersion}|report:${envelope.reportSchemaVersion}|hash:v2|proof:4.1`;
  if (value.length > 128) throw proofError('PROOF_ENVELOPE_INVALID', { field: 'productVersion' });
  return value;
}

export function registryPayload(envelope, reportURI = '') {
  if (typeof reportURI !== 'string' || reportURI.length > 512) throw proofError('PROOF_ENVELOPE_INVALID', { field: 'reportURI' });
  return {
    projectId: registryProjectId(envelope.projectId),
    sourceHash: digestToBytes32(envelope.sourceManifestDigest, 'sourceManifestDigest'),
    reportHash: digestToBytes32(envelope.reportHash, 'reportHash'),
    score: REGISTRY_SCORE,
    scannerVersion: registryScannerVersion(envelope),
    reportURI,
  };
}

export function prepareRegistryPublish(envelope, context = {}) {
  if (!context.report) throw proofError('PROOF_INTEGRITY_INVALID', { reason: 'report-required' });
  verifyV4ProofEnvelope(envelope, { report: context.report });
  const network = assertTrustedNetwork({
    networkKey: context.networkKey ?? envelope.networkKey,
    providerChainId: context.providerChainId,
    registryAddress: context.registryAddress ?? envelope.registryAddress,
  });
  if (network.chainId !== envelope.chainId) throw proofError('PROOF_CHAIN_MISMATCH');
  if (!context.signerAvailable) throw proofError('PROOF_SIGNER_REQUIRED', { reason: 'signer-unavailable' });
  let account;
  try { account = checksumAddress(context.account, 'account'); } catch { throw proofError('PROOF_SIGNER_REQUIRED'); }
  const payload = registryPayload(envelope, context.reportURI ?? '');
  if (context.existingRecord) {
    try { verifyRegistryRecord(context.existingRecord, envelope, { publisher: account }); }
    catch { throw proofError('PROOF_DUPLICATE_CONFLICT'); }
    const identity = context.existingTransactionIdentity ?? null;
    if (identity && (
      Number(identity.chainId) !== network.chainId
      || String(identity.registryAddress ?? '').toLowerCase() !== network.registryAddress.toLowerCase()
      || identity.reportHash !== envelope.reportHash
      || !/^0x[0-9a-fA-F]{64}$/u.test(String(identity.transactionHash ?? ''))
    )) throw proofError('PROOF_DUPLICATE_CONFLICT', { reason: 'transaction-identity' });
    return Object.freeze({
      status: 'already-published',
      idempotent: true,
      incompleteDisclosure: envelope.complete ? null : [...envelope.incompleteReasonCodes],
      scoreMeaning: REGISTRY_SCORE_MEANING,
      payload,
      transactionIdentity: identity,
      transactionRequest: null,
    });
  }
  const data = encodePublishReport(payload);
  if (data.length > 2 + (4096 * 2)) throw proofError('PROOF_ENVELOPE_INVALID', { field: 'calldata' });
  return Object.freeze({
    status: 'ready',
    idempotent: false,
    incompleteDisclosure: envelope.complete ? null : [...envelope.incompleteReasonCodes],
    scoreMeaning: REGISTRY_SCORE_MEANING,
    payload,
    transactionIdentity: null,
    transactionRequest: Object.freeze({
      from: account,
      to: network.registryAddress,
      data,
      value: '0x0',
      chainId: network.chainIdHex,
    }),
  });
}
