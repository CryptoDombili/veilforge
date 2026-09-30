import { classifyWorkerFailure, webV4Error } from '../errors.js';
import { normalizeWebV4Limits } from './limits.js';
import { assertWorkerMessage, createWorkerMessage, semanticScanPayload } from './protocol.js';

const requestId = () => globalThis.crypto?.randomUUID?.() ?? `v4-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const FATAL_WORKER_CODES = new Set([
  'WEB_V4_WORKER_INIT_FAILED', 'WEB_V4_COMPILER_LOAD_FAILED', 'WEB_V4_ASSET_NOT_FOUND',
  'WEB_V4_CSP_BLOCKED', 'WEB_V4_MIME_MISMATCH', 'WEB_V4_MESSAGE_ERROR', 'WEB_V4_WORKER_RUNTIME_EXCEPTION',
]);

export function createWorkerClient(options = {}) {
  const workerAssetPath = 'v4/veilforge-v4-scanner.worker.js';
  let worker;
  try {
    worker = (options.workerFactory ?? (() => new Worker(new URL('../veilforge-v4-scanner.worker.js', import.meta.url), { type: 'module', name: 'veilforge-v4' })))();
  } catch (error) {
    throw classifyWorkerFailure(error, { stage: 'construction', assetPath: workerAssetPath });
  }
  const limits = normalizeWebV4Limits(options.limits);
  const onLifecycle = typeof options.onLifecycle === 'function' ? options.onLifecycle : null;
  const lifecycleIteration = Number.isInteger(options.lifecycleIteration) ? options.lifecycleIteration : null;
  let active = null;
  let disposed = false;
  let terminationError = null;
  let readySettled = false;
  let workerReadyReached = false;
  let pendingListeners = 3;
  const pendingTimers = new Set();
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  ready.catch(() => {});

  const snapshot = (stage, extra = {}) => Object.freeze({
    lifecycleIteration, stage, workerCreated: true, workerReady: workerReadyReached,
    scanStarted: active !== null, scanCompleted: stage === 'scan-completed', abortSent: active?.abortSent === true,
    workerTerminated: disposed, clientDisposed: disposed, activeWorkers: disposed ? 0 : 1,
    activeRequests: active ? 1 : 0, pendingTimers: pendingTimers.size, pendingListeners,
    pendingPromises: (readySettled ? 0 : 1) + (active ? 1 : 0), ...extra,
  });
  const emit = (stage, extra) => { try { onLifecycle?.(snapshot(stage, extra)); } catch {} };
  const schedule = (callback, milliseconds) => { const timer = setTimeout(() => { pendingTimers.delete(timer); callback(); }, milliseconds); pendingTimers.add(timer); return timer; };
  const clearScheduled = (timer) => { if (timer !== null && timer !== undefined) { clearTimeout(timer); pendingTimers.delete(timer); } };
  const settleReady = (kind, value) => { if (readySettled) return; readySettled = true; if (kind === 'resolve') readyResolve(value); else readyReject(value); };

  emit('worker-created');

  const terminate = (error) => {
    if (disposed) return;
    disposed = true;
    terminationError = error ?? webV4Error('WEB_V4_ABORTED', 'Worker disposed.');
    settleReady('reject', terminationError);
    clearScheduled(active?.timeout);
    clearScheduled(active?.hardTimeout);
    if (active) active.reject(terminationError);
    active = null;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    pendingListeners = 0;
    worker.terminate();
    emit('worker-terminated', { errorCode: terminationError.code ?? 'WEB_V4_WORKER_CRASH' });
  };

  worker.onmessage = (event) => {
    let message;
    try { message = assertWorkerMessage(event.data); }
    catch (error) { settleReady('reject', error); terminate(error); return; }
    if (message.messageType === 'ready') { workerReadyReached = true; settleReady('resolve', message.payload); emit('worker-ready'); return; }
    if (message.messageType === 'error' && (!workerReadyReached || message.requestId === 'worker')) {
      terminate(webV4Error(message.payload.code, message.payload.message, message.payload.diagnostic));
      return;
    }
    if (!active || message.requestId !== active.requestId) return;
    if (message.messageType === 'progress') { active.onProgress?.(message.payload); emit('scan-progress'); return; }
    if (message.messageType === 'result') { const current = active; active = null; clearScheduled(current.timeout); clearScheduled(current.hardTimeout); emit('scan-completed'); current.resolve(message.payload.result); }
    if (message.messageType === 'error') {
      const current = active; active = null; clearScheduled(current.timeout); clearScheduled(current.hardTimeout);
      const error = webV4Error(message.payload.code, message.payload.message, message.payload.diagnostic);
      emit('scan-error', { errorCode: message.payload.code }); current.reject(error);
      if (FATAL_WORKER_CODES.has(error.code)) terminate(error);
    }
  };
  worker.onerror = (event) => terminate(classifyWorkerFailure(event, {
    stage: workerReadyReached ? 'runtime' : 'initialization',
    assetPath: event?.filename ?? workerAssetPath,
  }));
  worker.onmessageerror = (event) => terminate(classifyWorkerFailure(event, { stage: 'message', assetPath: workerAssetPath }));

  function abort(id = active?.requestId) {
    if (!active || id !== active.requestId) return false;
    if (active.abortSent) { terminate(webV4Error('WEB_V4_ABORTED', 'V4 worker was terminated after repeated abort.')); return true; }
    active.abortSent = true;
    worker.postMessage(createWorkerMessage('abort', active.requestId));
    emit('abort-sent');
    active.hardTimeout = schedule(() => terminate(webV4Error('WEB_V4_TIMEOUT', 'V4 worker did not stop after abort.')), limits.abortGraceMs);
    return true;
  }

  async function scan(scanInput, scanOptions = {}) {
    if (disposed) throw terminationError ?? webV4Error('WEB_V4_WORKER_CRASH', 'V4 worker is disposed.');
    if (active) throw webV4Error('WEB_V4_WORKER_BUSY', 'Only one V4 scan may be active.');
    await ready;
    if (disposed) throw terminationError ?? webV4Error('WEB_V4_WORKER_CRASH', 'V4 worker is disposed.');
    const id = scanOptions.requestId ?? requestId();
    return new Promise((resolve, reject) => {
      active = { requestId: id, resolve, reject, onProgress: scanOptions.onProgress, abortSent: false, timeout: null, hardTimeout: null };
      active.timeout = schedule(() => abort(id), scanOptions.globalTimeoutMs ?? limits.globalTimeoutMs);
      emit('scan-started');
      worker.postMessage(createWorkerMessage('scan-request', id, semanticScanPayload(scanInput, { stageTimeoutMs: scanOptions.stageTimeoutMs ?? limits.stageTimeoutMs, globalTimeoutMs: scanOptions.globalTimeoutMs ?? limits.globalTimeoutMs })));
    });
  }

  function dispose() {
    if (!disposed) worker.postMessage(createWorkerMessage('shutdown', 'worker'));
    terminate(webV4Error('WEB_V4_ABORTED', 'V4 worker disposed.'));
  }

  return Object.freeze({ ready, scan, abort, dispose, get activeRequestId() { return active?.requestId ?? null; }, get disposed() { return disposed; }, get lifecycle() { return snapshot('snapshot'); } });
}
