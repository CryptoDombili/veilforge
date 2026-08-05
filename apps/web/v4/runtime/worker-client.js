import { webV4Error } from '../errors.js';
import { normalizeWebV4Limits } from './limits.js';
import { assertWorkerMessage, createWorkerMessage, semanticScanPayload } from './protocol.js';

const requestId = () => globalThis.crypto?.randomUUID?.() ?? `v4-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function createWorkerClient(options = {}) {
  const worker = (options.workerFactory ?? (() => new Worker(new URL('./worker-entry.js', import.meta.url), { type: 'module', name: 'veilforge-v4' })))();
  const limits = normalizeWebV4Limits(options.limits);
  let active = null;
  let disposed = false;
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });

  const terminate = (error) => {
    if (disposed) return;
    disposed = true;
    clearTimeout(active?.timeout);
    clearTimeout(active?.hardTimeout);
    if (active) active.reject(error ?? webV4Error('WEB_V4_ABORTED', 'Worker disposed.'));
    active = null;
    worker.terminate();
  };

  worker.onmessage = (event) => {
    let message;
    try { message = assertWorkerMessage(event.data); }
    catch (error) { readyReject(error); terminate(error); return; }
    if (message.messageType === 'ready') { readyResolve(message.payload); return; }
    if (!active || message.requestId !== active.requestId) return;
    if (message.messageType === 'progress') { active.onProgress?.(message.payload); return; }
    if (message.messageType === 'result') { const current = active; active = null; clearTimeout(current.timeout); clearTimeout(current.hardTimeout); current.resolve(message.payload.result); }
    if (message.messageType === 'error') { const current = active; active = null; clearTimeout(current.timeout); clearTimeout(current.hardTimeout); current.reject(webV4Error(message.payload.code, message.payload.message)); }
  };
  worker.onerror = () => terminate(webV4Error('WEB_V4_WORKER_CRASH', 'V4 worker crashed.'));

  function abort(id = active?.requestId) {
    if (!active || id !== active.requestId) return false;
    if (active.abortSent) { terminate(webV4Error('WEB_V4_ABORTED', 'V4 worker was terminated after repeated abort.')); return true; }
    active.abortSent = true;
    worker.postMessage(createWorkerMessage('abort', active.requestId));
    active.hardTimeout = setTimeout(() => terminate(webV4Error('WEB_V4_TIMEOUT', 'V4 worker did not stop after abort.')), limits.abortGraceMs);
    return true;
  }

  async function scan(scanInput, scanOptions = {}) {
    if (disposed) throw webV4Error('WEB_V4_WORKER_CRASH', 'V4 worker is disposed.');
    if (active) throw webV4Error('WEB_V4_WORKER_BUSY', 'Only one V4 scan may be active.');
    await ready;
    const id = scanOptions.requestId ?? requestId();
    return new Promise((resolve, reject) => {
      active = { requestId: id, resolve, reject, onProgress: scanOptions.onProgress, abortSent: false, timeout: null, hardTimeout: null };
      active.timeout = setTimeout(() => abort(id), scanOptions.globalTimeoutMs ?? limits.globalTimeoutMs);
      worker.postMessage(createWorkerMessage('scan-request', id, semanticScanPayload(scanInput, { stageTimeoutMs: scanOptions.stageTimeoutMs ?? limits.stageTimeoutMs, globalTimeoutMs: scanOptions.globalTimeoutMs ?? limits.globalTimeoutMs })));
    });
  }

  function dispose() {
    if (!disposed) worker.postMessage(createWorkerMessage('shutdown', 'worker'));
    terminate(webV4Error('WEB_V4_ABORTED', 'V4 worker disposed.'));
  }

  return Object.freeze({ ready, scan, abort, dispose, get activeRequestId() { return active?.requestId ?? null; }, get disposed() { return disposed; } });
}
