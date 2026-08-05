const MESSAGES = Object.freeze({
  SARIF_SCHEMA_INVALID: 'The SARIF document does not match the supported schema.', SARIF_RULE_INVALID: 'A SARIF rule is invalid.',
  SARIF_RESULT_INVALID: 'A SARIF result is invalid.', SARIF_LOCATION_UNSAFE: 'A source location URI is unsafe.',
  SARIF_INTEGRITY_MISMATCH: 'The SARIF document does not match the report hash.', SARIF_VERSION_UNSUPPORTED: 'The SARIF version is unsupported.',
  SARIF_SERIALIZATION_ERROR: 'SARIF serialization failed.', SARIF_REPORT_INVALID: 'The source report is invalid.',
});
export function sarifError(code, details = {}) { const error = new Error(MESSAGES[code] ?? 'SARIF operation failed.'); error.name = 'VeilForgeSarifError'; error.code = code; error.safeDetails = Object.freeze({ ...details }); return error; }
