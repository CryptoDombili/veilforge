import { immutablePublic } from './types.js';

export const SDK_ERROR_CODES = Object.freeze([
  'SDK_INPUT_INVALID', 'SDK_OPTION_INVALID', 'SDK_SCAN_FAILED', 'SDK_SCAN_TIMEOUT',
  'SDK_SCAN_ABORTED', 'SDK_PROGRESS_CALLBACK_FAILED', 'SDK_REPORT_INVALID',
  'SDK_EXPORT_INVALID', 'SDK_VERSION_UNSUPPORTED', 'SDK_INTERNAL_ERROR',
]);

const SAFE_MESSAGES = Object.freeze({
  SDK_INPUT_INVALID: 'The SDK input is invalid.',
  SDK_OPTION_INVALID: 'The SDK options are invalid.',
  SDK_SCAN_FAILED: 'The scan failed.',
  SDK_SCAN_TIMEOUT: 'The scan timed out.',
  SDK_SCAN_ABORTED: 'The scan was aborted.',
  SDK_PROGRESS_CALLBACK_FAILED: 'The progress callback failed.',
  SDK_REPORT_INVALID: 'The report failed integrity verification.',
  SDK_EXPORT_INVALID: 'The export package failed verification.',
  SDK_VERSION_UNSUPPORTED: 'The requested version is not supported.',
  SDK_INTERNAL_ERROR: 'The SDK encountered an internal error.',
});

export class VeilForgeSdkError extends Error {
  constructor(code, options = {}) {
    super(options.message ?? SAFE_MESSAGES[code] ?? SAFE_MESSAGES.SDK_INTERNAL_ERROR);
    this.name = 'VeilForgeSdkError';
    this.code = SDK_ERROR_CODES.includes(code) ? code : 'SDK_INTERNAL_ERROR';
    this.stage = options.stage ?? null;
    this.retryable = Boolean(options.retryable);
    this.causeCode = options.causeCode ?? null;
    this.incompleteReasons = Object.freeze([...(options.incompleteReasons ?? [])]);
    this.partialResult = options.partialResult ? immutablePublic(options.partialResult) : null;
    this.safeDetails = immutablePublic(options.safeDetails ?? {});
  }
}

export const sdkError = (code, options) => new VeilForgeSdkError(code, options);

function causeCode(error) {
  let current = error;
  for (let depth = 0; current && depth < 5; depth += 1, current = current.cause) {
    if (current.code === 'SDK_PROGRESS_CALLBACK_FAILED' || current.causeCode === 'SDK_PROGRESS_CALLBACK_FAILED') return 'SDK_PROGRESS_CALLBACK_FAILED';
  }
  return error?.causeCode ?? error?.code ?? null;
}

export function mapScanError(error, partialResult = null) {
  if (error instanceof VeilForgeSdkError) return error;
  const cause = causeCode(error);
  const code = cause === 'SDK_PROGRESS_CALLBACK_FAILED' ? cause
    : error?.code === 'SCAN_STAGE_TIMEOUT' ? 'SDK_SCAN_TIMEOUT'
      : error?.code === 'SCAN_ABORTED' ? 'SDK_SCAN_ABORTED'
        : error?.code === 'SCAN_INPUT_INVALID' ? 'SDK_INPUT_INVALID'
          : error?.code?.startsWith('SCAN_') ? 'SDK_SCAN_FAILED' : 'SDK_INTERNAL_ERROR';
  return sdkError(code, {
    stage: error?.stage ?? null,
    retryable: code === 'SDK_SCAN_TIMEOUT',
    causeCode: cause,
    incompleteReasons: partialResult?.incompleteReasons ?? [],
    partialResult,
  });
}
