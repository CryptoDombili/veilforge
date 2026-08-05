import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerClient } from '../../../apps/web/v4/runtime/worker-client.js';
import { createWorkerMessage } from '../../../apps/web/v4/runtime/protocol.js';

class StressWorker {
  constructor() { this.terminated = false; queueMicrotask(() => this.onmessage?.({ data: createWorkerMessage('ready', 'worker', { available: true }) })); }
  postMessage(message) { if (message.messageType === 'scan-request') queueMicrotask(() => this.onmessage?.({ data: createWorkerMessage('result', message.requestId, { result: { verified: true, iteration: message.requestId } }) })); }
  terminate() { this.terminated = true; }
}

test('ten create scan dispose iterations are bounded with zero lifecycle residue', async () => {
  const iterations = [];
  const suiteStart = performance.now();
  for (let index = 0; index < 10; index += 1) {
    const worker = new StressWorker(); const diagnostics = []; const start = performance.now();
    const client = createWorkerClient({ workerFactory: () => worker, lifecycleIteration: index + 1, onLifecycle: (item) => diagnostics.push(item) });
    const result = await client.scan({ projectId: `iteration-${index + 1}` }, { requestId: `iteration-${index + 1}`, globalTimeoutMs: 500 });
    client.dispose(); const final = client.lifecycle;
    assert.equal(result.verified, true); assert.equal(worker.terminated, true);
    assert.deepEqual({ workers: final.activeWorkers, requests: final.activeRequests, timers: final.pendingTimers, listeners: final.pendingListeners, promises: final.pendingPromises }, { workers: 0, requests: 0, timers: 0, listeners: 0, promises: 0 });
    for (const stage of ['worker-created', 'worker-ready', 'scan-started', 'scan-completed', 'worker-terminated']) assert.equal(diagnostics.some((item) => item.stage === stage), true, `${stage} iteration ${index + 1}`);
    iterations.push({ lifecycleIteration: index + 1, durationMs: Number((performance.now() - start).toFixed(3)), activeWorkers: final.activeWorkers, activeRequests: final.activeRequests, pendingTimers: final.pendingTimers, pendingListeners: final.pendingListeners, pendingPromises: final.pendingPromises });
  }
  const durationMs = performance.now() - suiteStart; assert.equal(durationMs < 2000, true);
  console.log(JSON.stringify({ lifecycleStress: 'passed', durationMs: Number(durationMs.toFixed(3)), orphanWorkers: 0, iterations }));
});
