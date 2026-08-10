export const WEB_V4_ERROR_CODES = Object.freeze([
  'WEB_V4_INPUT_INVALID', 'WEB_V4_INPUT_LIMIT', 'WEB_V4_DIRECTORY_DROP_UNSUPPORTED', 'WEB_V4_COMPILE_FAILED', 'WEB_V4_IMPORT_RESOLUTION_FAILED', 'WEB_V4_PROTOCOL_INVALID',
  'WEB_V4_PROTOCOL_MISMATCH', 'WEB_V4_WORKER_BUSY', 'WEB_V4_RUNTIME_UNAVAILABLE',
  'WEB_V4_ABORTED', 'WEB_V4_TIMEOUT', 'WEB_V4_WORKER_CRASH', 'WEB_V4_REPORT_INVALID',
  'WEB_V4_REPORT_UNVERIFIED', 'WEB_V4_LOCATION_UNSAFE', 'WEB_V4_PERSISTENCE_INVALID',
  'WEB_V4_PERSISTENCE_LIMIT', 'WEB_V4_STORAGE_QUOTA', 'WEB_V4_EXPORT_INVALID',
  'WEB_V4_PROOF_UNAVAILABLE', 'WEB_V4_PROOF_ENVELOPE_INVALID', 'WEB_V4_PROVIDER_UNAVAILABLE',
  'WEB_V4_ACCOUNT_UNAVAILABLE', 'WEB_V4_WRONG_NETWORK', 'WEB_V4_REGISTRY_MISMATCH',
  'WEB_V4_PROOF_DISCLOSURE_REQUIRED', 'WEB_V4_PROOF_PREFLIGHT_FAILED', 'WEB_V4_PROOF_DUPLICATE',
  'WEB_V4_USER_REJECTED', 'WEB_V4_TX_INVALID', 'WEB_V4_TX_NOT_FOUND', 'WEB_V4_RECEIPT_PENDING', 'WEB_V4_RECEIPT_REVERTED',
  'WEB_V4_RECEIPT_INVALID', 'WEB_V4_EVENT_MISMATCH', 'WEB_V4_PROOF_PERSISTENCE_FAILED',
  'WEB_V4_USER_GESTURE_REQUIRED', 'WEB_V4_REGISTRY_CODE_MISSING',
  'WEB_V4_REGISTRY_ABI_MISMATCH', 'WEB_V4_SEND_DISABLED',
]);

export class WebV4Error extends Error {
  constructor(code, message, safeDetails = {}) {
    super(message);
    this.name = 'WebV4Error';
    this.code = WEB_V4_ERROR_CODES.includes(code) ? code : 'WEB_V4_WORKER_CRASH';
    this.safeDetails = Object.freeze({ ...safeDetails });
  }
}

export function webV4Error(code, message, safeDetails) {
  return new WebV4Error(code, message, safeDetails);
}

const safeToken = (value, fallback = null) => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,96}$/u.test(value) ? value : fallback;

export function safeWorkerError(error, fallback = 'WEB_V4_WORKER_CRASH', context = {}) {
  const code = WEB_V4_ERROR_CODES.includes(error?.code) ? error.code : fallback;
  const messages = {
    WEB_V4_ABORTED: 'The V4 scan was aborted.',
    WEB_V4_TIMEOUT: 'The V4 worker exceeded its safe runtime limit.',
    WEB_V4_COMPILE_FAILED: 'Solidity compilation failed under the pinned compiler.',
    WEB_V4_RUNTIME_UNAVAILABLE: 'A browser-compatible V4 scanner runtime is not available in this build.',
    WEB_V4_WORKER_BUSY: 'The V4 worker already has an active scan.',
  };
  const message = messages[code] ?? 'The V4 worker could not complete the request.';
  const details = error?.safeDetails && typeof error.safeDetails === 'object' ? error.safeDetails : {};
  const diagnostic = code === 'WEB_V4_COMPILE_FAILED' ? Object.freeze({
    failureType: 'compile',
    stage: 'compilation',
    requestId: safeToken(context.requestId ?? details.requestId, 'worker'),
    causeCode: safeToken(details.causeCode ?? error?.causeCode ?? error?.code, code),
    errorType: safeToken(details.errorType ?? error?.name, 'Error'),
    ...(Number.isInteger(details.diagnosticCount) && details.diagnosticCount >= 0 ? { diagnosticCount: details.diagnosticCount } : {}),
    ...(Array.isArray(details.compilerDiagnostics) ? { compilerDiagnostics: details.compilerDiagnostics.slice(0, 20).map((item) => Object.freeze({ type: safeToken(item?.type, 'CompilerError'), severity: safeToken(item?.severity, 'error'), errorCode: safeToken(String(item?.errorCode ?? ''), 'unknown') })) } : {}),
  }) : null;
  return Object.freeze({ code, message, retryable: !['WEB_V4_PROTOCOL_MISMATCH', 'WEB_V4_COMPILE_FAILED'].includes(code), ...(diagnostic ? { diagnostic } : {}) });
}
