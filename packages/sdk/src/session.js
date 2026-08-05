import {
  createScanSession as createInternalSession,
  runScanStage as runInternalStage,
  runRemainingStages as runInternalRemaining,
  getScanProgress as getInternalProgress,
  abortScan as abortInternal,
} from '../../analyzer/src/v4/orchestration/index.js';
import { normalizeSdkInput } from './input.js';
import { normalizeSdkOptions, toOrchestrationOptions } from './options.js';
import { createProgressAdapter } from './progress.js';
import { mapScanError, sdkError } from './errors.js';
import { projectScanResult, projectSessionSnapshot } from './result.js';
import { immutablePublic } from './types.js';

const sessions = new WeakMap();

function recordFor(handle) {
  const record = sessions.get(handle);
  if (!record) throw sdkError('SDK_INPUT_INVALID');
  return record;
}
function snapshot(record) {
  const view = projectSessionSnapshot(record.internal, record.options.export);
  sessions.set(view, record);
  return view;
}
function cleanup(record) {
  if (!record.cleaned) { record.cleaned = true; record.cleanup?.(); }
}
function failureStatus(error) {
  return error?.code === 'SCAN_STAGE_TIMEOUT' ? 'timed-out' : error?.code === 'SCAN_ABORTED' ? 'aborted' : 'failed';
}

export function createScanSession(input, options = {}, clientDefaults = {}) {
  const normalizedOptions = normalizeSdkOptions(options, clientDefaults.options);
  const normalizedInput = normalizeSdkInput(input, clientDefaults, normalizedOptions.domains);
  let internal; let cleanupSignal = () => {}; let orchestrationSignal = normalizedOptions.signal;
  if (normalizedOptions.signal) {
    const controller = new AbortController();
    const forward = () => controller.abort(normalizedOptions.signal.reason);
    if (normalizedOptions.signal.aborted) forward(); else normalizedOptions.signal.addEventListener('abort', forward, { once: true });
    cleanupSignal = () => normalizedOptions.signal.removeEventListener('abort', forward);
    orchestrationSignal = controller.signal;
  }
  const progress = createProgressAdapter(normalizedOptions, () => internal);
  internal = createInternalSession(normalizedInput, toOrchestrationOptions({ ...normalizedOptions, signal: orchestrationSignal }, progress, normalizedInput.stageBudgets));
  return snapshot({ internal, options: normalizedOptions, cleanup: cleanupSignal, cleaned: false });
}

export async function runScanStage(handle, stageName) {
  const record = recordFor(handle);
  try { await runInternalStage(record.internal, stageName); return snapshot(record); }
  catch (error) {
    cleanup(record);
    const partial = projectScanResult(record.internal, { status: failureStatus(error), includeExport: record.options.export });
    throw mapScanError(error, partial);
  }
}

export async function runRemainingStages(handle) {
  const record = recordFor(handle);
  try {
    await runInternalRemaining(record.internal);
    cleanup(record);
    return projectScanResult(record.internal, { includeExport: record.options.export });
  } catch (error) {
    cleanup(record);
    const partial = projectScanResult(record.internal, { status: failureStatus(error), includeExport: record.options.export });
    const mapped = mapScanError(error, partial);
    if (record.options.throwOnError) throw mapped;
    return projectScanResult(record.internal, { status: failureStatus(error), errors: [{ code: mapped.code, stage: mapped.stage, retryable: mapped.retryable, causeCode: mapped.causeCode }], includeExport: record.options.export });
  }
}

export function getScanProgress(handle) {
  const record = recordFor(handle);
  const progress = getInternalProgress(record.internal);
  return immutablePublic({
    sessionId: progress.sessionId,
    status: progress.status,
    currentStage: progress.currentStage,
    nextStage: progress.nextStage,
    completedStages: progress.completedStages,
    pendingStages: record.internal.stageOrder.slice(record.internal.stageCursor),
    completedStageCount: progress.completedStages.length,
    totalStageCount: progress.stages.length,
    aborted: record.internal.signal.aborted,
  });
}

export function abortScan(handle, reason = 'aborted') {
  const record = recordFor(handle);
  abortInternal(record.internal, typeof reason === 'string' ? reason : 'aborted');
  cleanup(record);
  return snapshot(record);
}
