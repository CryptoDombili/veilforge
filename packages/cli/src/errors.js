import { EXIT_CODES } from './exit-codes.js';

export const CLI_ERROR_CODES = Object.freeze([
  'CLI_ARGUMENT_INVALID', 'CLI_CONFIG_INVALID', 'CLI_SOURCE_INVALID', 'CLI_SOURCE_LIMIT_EXCEEDED',
  'CLI_WORKER_START_FAILED', 'CLI_WORKER_PROTOCOL_ERROR', 'CLI_WORKER_EXITED', 'CLI_SCAN_FAILED',
  'CLI_SCAN_TIMEOUT', 'CLI_SCAN_ABORTED', 'CLI_REPORT_INVALID', 'CLI_EXPORT_INVALID',
  'CLI_OUTPUT_EXISTS', 'CLI_OUTPUT_WRITE_FAILED', 'CLI_GATE_FAILED', 'CLI_BENCHMARK_FAILED', 'CLI_INTERNAL_ERROR',
]);
const EXIT = Object.freeze({
  CLI_ARGUMENT_INVALID: EXIT_CODES.ARGUMENT, CLI_CONFIG_INVALID: EXIT_CODES.ARGUMENT,
  CLI_SOURCE_INVALID: EXIT_CODES.SOURCE, CLI_SOURCE_LIMIT_EXCEEDED: EXIT_CODES.SOURCE,
  CLI_WORKER_START_FAILED: EXIT_CODES.PROTOCOL, CLI_WORKER_PROTOCOL_ERROR: EXIT_CODES.PROTOCOL,
  CLI_WORKER_EXITED: EXIT_CODES.PROTOCOL, CLI_SCAN_FAILED: EXIT_CODES.SCAN_FAILED,
  CLI_SCAN_TIMEOUT: EXIT_CODES.TIMEOUT, CLI_SCAN_ABORTED: EXIT_CODES.ABORTED,
  CLI_REPORT_INVALID: EXIT_CODES.REPORT_INVALID, CLI_EXPORT_INVALID: EXIT_CODES.EXPORT_INVALID,
  CLI_OUTPUT_EXISTS: EXIT_CODES.OUTPUT, CLI_OUTPUT_WRITE_FAILED: EXIT_CODES.OUTPUT,
  CLI_GATE_FAILED: EXIT_CODES.GATE_FAILED,
  CLI_BENCHMARK_FAILED: EXIT_CODES.PROTOCOL,
  CLI_INTERNAL_ERROR: EXIT_CODES.GENERIC,
});
const MESSAGE = Object.freeze({
  CLI_ARGUMENT_INVALID: 'Invalid command-line arguments.', CLI_CONFIG_INVALID: 'Invalid CLI configuration.',
  CLI_SOURCE_INVALID: 'Source discovery failed.', CLI_SOURCE_LIMIT_EXCEEDED: 'Source limits were exceeded.',
  CLI_WORKER_START_FAILED: 'The scan worker could not start.', CLI_WORKER_PROTOCOL_ERROR: 'The scan worker protocol failed.',
  CLI_WORKER_EXITED: 'The scan worker exited unexpectedly.', CLI_SCAN_FAILED: 'The scan failed.',
  CLI_SCAN_TIMEOUT: 'The scan exceeded its hard timeout.', CLI_SCAN_ABORTED: 'The scan was aborted.',
  CLI_REPORT_INVALID: 'Report verification failed.', CLI_EXPORT_INVALID: 'Export verification failed.',
  CLI_OUTPUT_EXISTS: 'Output already exists; use --overwrite to replace it.', CLI_OUTPUT_WRITE_FAILED: 'Output could not be written safely.',
  CLI_GATE_FAILED: 'The policy gate failed.',
  CLI_BENCHMARK_FAILED: 'The benchmark runner failed.',
  CLI_INTERNAL_ERROR: 'The CLI encountered an internal error.',
});
export class CliError extends Error {
  constructor(code, options = {}) {
    super(options.message ?? MESSAGE[code] ?? MESSAGE.CLI_INTERNAL_ERROR);
    this.name = 'CliError'; this.code = CLI_ERROR_CODES.includes(code) ? code : 'CLI_INTERNAL_ERROR';
    this.exitCode = options.exitCode ?? EXIT[this.code] ?? EXIT_CODES.GENERIC;
    this.stage = options.stage ?? null; this.retryable = Boolean(options.retryable);
    this.causeCode = options.causeCode ?? null; this.incompleteReasons = Object.freeze([...(options.incompleteReasons ?? [])]);
    this.safeDetails = Object.freeze({ ...(options.safeDetails ?? {}) });
  }
}
export const cliError = (code, options) => new CliError(code, options);
export function publicCliError(error) {
  const item = error instanceof CliError ? error : cliError('CLI_INTERNAL_ERROR', { causeCode: error?.code ?? error?.name ?? null });
  return { code: item.code, message: item.message, exitCode: item.exitCode, stage: item.stage, retryable: item.retryable, causeCode: item.causeCode, incompleteReasons: [...item.incompleteReasons], safeDetails: { ...item.safeDetails } };
}
