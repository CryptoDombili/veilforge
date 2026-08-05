import { safeWorkerError, webV4Error } from '../errors.js';
import { normalizeWebV4Limits } from './limits.js';
import { assertWorkerMessage, createWorkerMessage, safeProgressPayload } from './protocol.js';

export function createWorkerRuntime(options = {}) {
  const post = options.postMessage;
  if (typeof post !== 'function') throw new TypeError('postMessage is required.');
  const scanner = typeof options.scan === 'function' ? options.scan : null;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const terminate = options.terminate ?? (() => {});
  let active = null;
  let closed = false;

  const send = (type, requestId, payload) => post(createWorkerMessage(type, requestId, payload));
  const clearActive = () => {
    if (!active) return;
    clearTimer(active.stageTimer);
    clearTimer(active.globalTimer);
    active = null;
  };
  const scheduleStage = (current, limits) => {
    clearTimer(current.stageTimer);
    current.stageTimer = setTimer(() => current.controller.abort(webV4Error('WEB_V4_TIMEOUT', 'Stage timeout.')), limits.stageTimeoutMs);
  };

  async function scanRequest(message) {
    if (active) { send('error', message.requestId, safeWorkerError(webV4Error('WEB_V4_WORKER_BUSY', 'Worker busy.'))); return; }
    if (!scanner) { send('error', message.requestId, safeWorkerError(webV4Error('WEB_V4_RUNTIME_UNAVAILABLE', 'Scanner unavailable.'))); return; }
    const limits = normalizeWebV4Limits(message.payload.limits);
    const controller = new AbortController();
    const current = { requestId: message.requestId, controller, abortCount: 0, stageTimer: null, globalTimer: null };
    active = current;
    scheduleStage(current, limits);
    current.globalTimer = setTimer(() => controller.abort(webV4Error('WEB_V4_TIMEOUT', 'Global timeout.')), limits.globalTimeoutMs);
    try {
      const result = await scanner(message.payload.scanInput, {
        signal: controller.signal,
        limits,
        onProgress(value) {
          if (active !== current || controller.signal.aborted) return;
          scheduleStage(current, limits);
          send('progress', message.requestId, safeProgressPayload(value));
        },
      });
      if (controller.signal.aborted) throw controller.signal.reason ?? webV4Error('WEB_V4_ABORTED', 'Aborted.');
      send('result', message.requestId, { result });
    } catch (error) {
      const reason = controller.signal.aborted ? controller.signal.reason ?? webV4Error('WEB_V4_ABORTED', 'Aborted.') : error;
      send('error', message.requestId, safeWorkerError(reason));
    } finally { if (active === current) clearActive(); }
  }

  async function handle(raw) {
    if (closed) return;
    let message;
    try { message = assertWorkerMessage(raw); }
    catch (error) { post(createWorkerMessage('error', typeof raw?.requestId === 'string' && raw.requestId ? raw.requestId : 'worker', safeWorkerError(error, error.code))); return; }
    if (message.messageType === 'scan-request') return scanRequest(message);
    if (message.messageType === 'abort' && active?.requestId === message.requestId) {
      active.abortCount += 1;
      if (active.abortCount > 1) { active.controller.abort(webV4Error('WEB_V4_ABORTED', 'Repeated abort.')); clearActive(); terminate(); return; }
      active.controller.abort(webV4Error('WEB_V4_ABORTED', 'Aborted by client.'));
    }
    if (message.messageType === 'shutdown') {
      closed = true;
      active?.controller.abort(webV4Error('WEB_V4_ABORTED', 'Worker shutdown.'));
      clearActive();
      terminate();
    }
  }

  return Object.freeze({
    start() { send('ready', 'worker', { available: Boolean(scanner), concurrency: 1 }); },
    handle,
    get activeRequestId() { return active?.requestId ?? null; },
    get closed() { return closed; },
  });
}
