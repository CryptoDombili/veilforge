import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerMessage } from '../../../apps/web/v4/runtime/protocol.js';
import { createWorkerClient } from '../../../apps/web/v4/runtime/worker-client.js';
import { wait } from './helpers.mjs';

class FakeWorker {
  constructor(mode = 'result') { this.mode = mode; this.messages = []; this.terminated = false; queueMicrotask(() => this.onmessage?.({ data: createWorkerMessage('ready', 'worker', { available: true }) })); }
  postMessage(message) {
    this.messages.push(message);
    if (message.messageType === 'scan-request' && this.mode === 'result') queueMicrotask(() => { this.onmessage?.({ data: createWorkerMessage('progress', message.requestId, { stage: 'compile' }) }); this.onmessage?.({ data: createWorkerMessage('result', message.requestId, { result: { ok: true } }) }); });
  }
  terminate() { this.terminated = true; }
}

test('worker client receives progress and result with one active scan', async () => {
  const worker = new FakeWorker(); const progress = []; const client = createWorkerClient({ workerFactory: () => worker });
  assert.deepEqual(await client.scan({ projectId: 'p' }, { requestId: 'r1', onProgress: (value) => progress.push(value) }), { ok: true });
  assert.equal(progress[0].stage, 'compile'); client.dispose(); assert.equal(worker.terminated, true);
});
test('hard timeout aborts then terminates an unresponsive worker without orphan', async () => {
  const worker = new FakeWorker('hang'); const client = createWorkerClient({ workerFactory: () => worker, limits: { globalTimeoutMs: 5, abortGraceMs: 5 } });
  await assert.rejects(client.scan({ projectId: 'p' }, { requestId: 'r1' }), { code: 'WEB_V4_TIMEOUT' });
  assert.equal(worker.messages.some((item) => item.messageType === 'abort'), true); assert.equal(worker.terminated, true); assert.equal(client.disposed, true);
});
test('second abort terminates immediately', async () => {
  const worker = new FakeWorker('hang'); const client = createWorkerClient({ workerFactory: () => worker, limits: { globalTimeoutMs: 100, abortGraceMs: 100 } });
  const pending = client.scan({ projectId: 'p' }, { requestId: 'r1' }); await wait(); client.abort(); client.abort();
  await assert.rejects(pending, { code: 'WEB_V4_ABORTED' }); assert.equal(worker.terminated, true);
});
