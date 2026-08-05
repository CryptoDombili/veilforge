import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cliError } from './errors.js';
import { validateWorkerMessage, workerMessage } from './worker-protocol.js';

const WORKER_URL = new URL('../worker/scan-worker.js', import.meta.url);
const DEFAULT_GRACE_MS = 100;
export function createWorkerScan(input, options = {}) {
  const requestId = randomUUID(); let child; let settled = false; let ready = false; let timedOut = false; let aborted = false;
  let hardTimer; let graceTimer; let startupTimer; let resolvePromise; let rejectPromise;
  let stopRequested = false;
  const cleanup = () => {
    clearTimeout(hardTimer); clearTimeout(graceTimer); clearTimeout(startupTimer);
    options.signal?.removeEventListener('abort', onAbort);
    child?.removeAllListeners('message'); child?.removeAllListeners('error'); child?.removeAllListeners('exit');
  };
  const forceKill = () => { if (child && !child.killed) child.kill('SIGKILL'); };
  const stopChild = () => {
    if (!child || child.killed || stopRequested) return; stopRequested = true;
    if (child.connected) {
      try { child.send(workerMessage(requestId, 'shutdown'), () => { try { if (child.connected) child.disconnect(); } catch {} }); } catch { forceKill(); }
    } else forceKill();
    const watchdog = setTimeout(forceKill, 250); watchdog.unref?.();
  };
  const rejectOnce = (error) => { if (settled) return; settled = true; stopChild(); cleanup(); rejectPromise(error); };
  const resolveOnce = (result) => { if (settled) return; settled = true; stopChild(); cleanup(); resolvePromise(result); };
  const requestStop = (kind) => {
    if (settled) return; if (kind === 'timeout') timedOut = true; else aborted = true;
    if (child?.connected) child.send(workerMessage(requestId, 'abort', { reason: kind }));
    clearTimeout(graceTimer); graceTimer = setTimeout(() => {
      forceKill();
      rejectOnce(cliError(kind === 'timeout' ? 'CLI_SCAN_TIMEOUT' : 'CLI_SCAN_ABORTED', { retryable: kind === 'timeout' }));
    }, options.graceMs ?? DEFAULT_GRACE_MS); graceTimer.unref?.();
  };
  const onAbort = () => requestStop('abort');
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve; rejectPromise = reject;
    try { child = fork(WORKER_URL, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'advanced', windowsHide: true }); }
    catch { rejectOnce(cliError('CLI_WORKER_START_FAILED')); return; }
    child.on('error', () => rejectOnce(cliError('CLI_WORKER_START_FAILED')));
    child.on('exit', (code, signal) => {
      if (settled) return;
      if (timedOut) rejectOnce(cliError('CLI_SCAN_TIMEOUT', { retryable: true }));
      else if (aborted) rejectOnce(cliError('CLI_SCAN_ABORTED'));
      else rejectOnce(cliError('CLI_WORKER_EXITED', { safeDetails: { code: Number.isInteger(code) ? code : null, signaled: Boolean(signal) } }));
    });
    child.on('message', (raw) => {
      try {
        const message = validateWorkerMessage(raw, ready ? requestId : undefined);
        if (message.messageType === 'ready') {
          if (ready) throw cliError('CLI_WORKER_PROTOCOL_ERROR'); ready = true; clearTimeout(startupTimer);
          child.send(workerMessage(requestId, 'scan-request', { input, options: options.sdkOptions ?? {} })); return;
        }
        if (timedOut) { forceKill(); rejectOnce(cliError('CLI_SCAN_TIMEOUT', { retryable: true })); return; }
        if (aborted) { forceKill(); rejectOnce(cliError('CLI_SCAN_ABORTED')); return; }
        if (message.messageType === 'progress') { options.onProgress?.(message.payload); return; }
        if (message.messageType === 'result') { resolveOnce(message.payload); return; }
        if (message.messageType === 'error') {
          const code = message.payload?.code === 'SDK_SCAN_TIMEOUT' ? 'CLI_SCAN_TIMEOUT' : message.payload?.code === 'SDK_SCAN_ABORTED' ? 'CLI_SCAN_ABORTED' : 'CLI_SCAN_FAILED';
          rejectOnce(cliError(code, { stage: message.payload?.stage, causeCode: message.payload?.code, incompleteReasons: message.payload?.incompleteReasons }));
          return;
        }
        throw cliError('CLI_WORKER_PROTOCOL_ERROR');
      } catch (error) { forceKill(); rejectOnce(error?.code?.startsWith('CLI_') ? error : cliError('CLI_WORKER_PROTOCOL_ERROR')); }
    });
    startupTimer = setTimeout(() => { forceKill(); rejectOnce(cliError('CLI_WORKER_START_FAILED')); }, options.startupTimeoutMs ?? 5_000); startupTimer.unref?.();
    hardTimer = setTimeout(() => requestStop('timeout'), options.hardTimeoutMs ?? 300_000); hardTimer.unref?.();
    if (options.signal) { if (options.signal.aborted) onAbort(); else options.signal.addEventListener('abort', onAbort, { once: true }); }
  });
  return Object.freeze({ promise, abort: () => requestStop('abort'), forceKill, get pid() { return child?.pid ?? null; } });
}
export const runWorkerScan = (input, options) => createWorkerScan(input, options).promise;
