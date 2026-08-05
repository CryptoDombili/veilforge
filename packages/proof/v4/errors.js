const MESSAGES = Object.freeze({
  PROOF_SCHEMA_INVALID: 'The report or proof envelope does not satisfy the required schema.',
  PROOF_INTEGRITY_INVALID: 'The report integrity check failed.',
  PROOF_VERSION_UNSUPPORTED: 'The report or proof version is not supported.',
  PROOF_LOCATION_UNSAFE: 'The report contains unsafe or inconsistent source locations.',
  PROOF_COMPILER_INVALID: 'The compiler identity is not eligible for V4 proof publication.',
  PROOF_ANALYZER_INVALID: 'The analyzer identity is not eligible for V4 proof publication.',
  PROOF_INCOMPLETE_INVALID: 'The incomplete-analysis disclosure is inconsistent.',
  PROOF_POLICY_INVALID: 'The policy result is inconsistent with the report summary.',
  PROOF_ENVELOPE_INVALID: 'The V4 proof envelope is invalid or has been tampered with.',
  PROOF_NETWORK_INVALID: 'The requested registry network is not trusted or enabled.',
  PROOF_CHAIN_MISMATCH: 'The selected chain does not match the trusted registry network.',
  PROOF_REGISTRY_MISMATCH: 'The registry address does not match the trusted network configuration.',
  PROOF_SIGNER_REQUIRED: 'A valid publisher account and signer are required for preflight.',
  PROOF_DUPLICATE_CONFLICT: 'An existing registry record conflicts with this proof.',
  PROOF_RECEIPT_INVALID: 'The registry receipt or publication event is invalid.',
  PROOF_STORAGE_INVALID: 'The stored proof is invalid or has been tampered with.',
  PROOF_LEGACY_INVALID: 'The legacy proof is invalid or unsupported.',
});

const SAFE_DETAIL_KEYS = new Set(['field', 'reason', 'version', 'networkKey', 'expected', 'actual']);

export class ProofV4Error extends Error {
  constructor(code, details = {}) {
    super(MESSAGES[code] ?? 'The proof operation failed closed.');
    this.name = 'ProofV4Error';
    this.code = code;
    this.details = Object.freeze(Object.fromEntries(
      Object.entries(details)
        .filter(([key, value]) => SAFE_DETAIL_KEYS.has(key) && ['string', 'number', 'boolean'].includes(typeof value))
        .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 160) : value]),
    ));
  }
}

export function proofError(code, details) {
  return new ProofV4Error(code, details);
}
