import { EXIT_CODES } from './exit-codes.js';
export function scanSummary(result, projectId, outputFiles = [], outputDirectory = null) {
  const status = result.status; const exitCode = status === 'completed' ? EXIT_CODES.COMPLETED : status === 'incomplete' ? EXIT_CODES.INCOMPLETE : status === 'timed-out' ? EXIT_CODES.TIMEOUT : status === 'aborted' ? EXIT_CODES.ABORTED : EXIT_CODES.SCAN_FAILED;
  return {
    ok: result.ok, status, exitCode, projectId, scanId: result.scanId,
    reportHash: result.report?.integrity?.reportHash ?? null,
    analysisComplete: result.report?.analysis?.complete ?? false,
    findingSummary: result.report?.summary ?? {}, outputFiles: [...outputFiles], outputDirectory,
    incompleteReasons: [...(result.incompleteReasons ?? [])], warnings: [...(result.warnings ?? [])], errors: [...(result.errors ?? [])],
  };
}
