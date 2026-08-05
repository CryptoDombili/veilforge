import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerClient } from '../../../apps/web/v4/runtime/worker-client.js';
import { createWorkerMessage } from '../../../apps/web/v4/runtime/protocol.js';

class DiagnosticWorker {
  constructor(mode = 'result', readyDelayMs = 0) {
    this.mode = mode; this.terminated = false; this.messages = [];
    this.readyTimer = setTimeout(() => this.onmessage?.({ data: createWorkerMessage('ready', 'worker', { available: true }) }), readyDelayMs);
  }
  postMessage(message) {
    this.messages.push(message);
    if (message.messageType !== 'scan-request') return;
    if (this.mode === 'result') queueMicrotask(() => { this.onmessage?.({ data: createWorkerMessage('progress', message.requestId, { stage: 'compile' }) }); this.onmessage?.({ data: createWorkerMessage('result', message.requestId, { result: { verified: true } }) }); });
    if (this.mode === 'crash') queueMicrotask(() => this.onerror?.(new Event('error')));
  }
  terminate() { clearTimeout(this.readyTimer); this.terminated = true; }
}

test('dispose while scan awaits ready rejects every promise and clears lifecycle state', async () => {
  const diagnostics = []; const worker = new DiagnosticWorker('result', 1000);
  const client = createWorkerClient({ workerFactory: () => worker, lifecycleIteration: 1, onLifecycle: (item) => diagnostics.push(item) });
  const started = performance.now(); const pending = client.scan({ projectId: 'ready-race' }, { requestId: 'ready-race' });
  await new Promise((resolve) => setTimeout(resolve, 5)); client.dispose();
  await assert.rejects(pending, { code: 'WEB_V4_ABORTED' });
  const final = client.lifecycle;
  assert.equal(performance.now() - started < 250, true); assert.equal(worker.terminated, true);
  assert.deepEqual({ activeWorkers: final.activeWorkers, activeRequests: final.activeRequests, pendingTimers: final.pendingTimers, pendingListeners: final.pendingListeners, pendingPromises: final.pendingPromises }, { activeWorkers: 0, activeRequests: 0, pendingTimers: 0, pendingListeners: 0, pendingPromises: 0 });
  assert.equal(diagnostics.some((item) => item.stage === 'worker-terminated'), true);
});

test('crash rejects the active scan and a fresh worker completes a real protocol scan', async () => {
  const crashed = createWorkerClient({ workerFactory: () => new DiagnosticWorker('crash'), lifecycleIteration: 2 });
  await assert.rejects(crashed.scan({ projectId: 'crash' }, { requestId: 'crash' }), { code: 'WEB_V4_WORKER_CRASH' });
  assert.equal(crashed.lifecycle.activeWorkers, 0); assert.equal(crashed.lifecycle.pendingPromises, 0);
  const restarted = createWorkerClient({ workerFactory: () => new DiagnosticWorker('result'), lifecycleIteration: 3 });
  assert.deepEqual(await restarted.scan({ projectId: 'restart' }, { requestId: 'restart' }), { verified: true }); restarted.dispose();
  assert.equal(restarted.lifecycle.activeWorkers, 0); assert.equal(restarted.lifecycle.pendingListeners, 0);
});
