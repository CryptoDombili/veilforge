export const WEB_V4_ERROR_CODES = Object.freeze([
  'WEB_V4_INPUT_INVALID', 'WEB_V4_INPUT_LIMIT', 'WEB_V4_PROTOCOL_INVALID',
  'WEB_V4_PROTOCOL_MISMATCH', 'WEB_V4_WORKER_BUSY', 'WEB_V4_RUNTIME_UNAVAILABLE',
  'WEB_V4_ABORTED', 'WEB_V4_TIMEOUT', 'WEB_V4_WORKER_CRASH', 'WEB_V4_REPORT_INVALID',
  'WEB_V4_REPORT_UNVERIFIED', 'WEB_V4_LOCATION_UNSAFE', 'WEB_V4_PERSISTENCE_INVALID',
  'WEB_V4_PERSISTENCE_LIMIT', 'WEB_V4_STORAGE_QUOTA', 'WEB_V4_EXPORT_INVALID',
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

export function safeWorkerError(error, fallback = 'WEB_V4_WORKER_CRASH') {
  const code = WEB_V4_ERROR_CODES.includes(error?.code) ? error.code : fallback;
  const messages = {
    WEB_V4_ABORTED: 'The V4 scan was aborted.',
    WEB_V4_TIMEOUT: 'The V4 worker exceeded its safe runtime limit.',
    WEB_V4_RUNTIME_UNAVAILABLE: 'A browser-compatible V4 scanner runtime is not available in this build.',
    WEB_V4_WORKER_BUSY: 'The V4 worker already has an active scan.',
  };
  return Object.freeze({ code, message: messages[code] ?? 'The V4 worker could not complete the request.', retryable: code !== 'WEB_V4_PROTOCOL_MISMATCH' });
}
