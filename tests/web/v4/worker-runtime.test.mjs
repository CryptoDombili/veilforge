import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerMessage } from '../../../apps/web/v4/runtime/protocol.js';
import { createWorkerRuntime } from '../../../apps/web/v4/runtime/worker-runtime.js';
import { wait } from './helpers.mjs';

test('worker announces ready and fail-closes when scanner bundle is unavailable', async () => {
  const messages = []; const runtime = createWorkerRuntime({ postMessage: (message) => messages.push(message) });
  runtime.start(); await runtime.handle(createWorkerMessage('scan-request', 'r1', { scanInput: {}, limits: {} }));
  assert.equal(messages[0].messageType, 'ready'); assert.equal(messages[0].payload.available, false);
  assert.equal(messages[1].payload.code, 'WEB_V4_RUNTIME_UNAVAILABLE');
});
test('worker emits safe progress and result for injected browser scanner', async () => {
  const messages = []; const runtime = createWorkerRuntime({ postMessage: (message) => messages.push(message), scan: async (_input, options) => { options.onProgress({ stage: 'compile', percent: 50, source: 'secret' }); return { report: 'ok' }; } });
  runtime.start(); await runtime.handle(createWorkerMessage('scan-request', 'r1', { scanInput: { projectId: 'p' }, limits: {} }));
  assert.deepEqual(messages.map((item) => item.messageType), ['ready', 'progress', 'result']);
  assert.equal(JSON.stringify(messages).includes('secret'), false);
});
test('worker returns structured error without source leakage', async () => {
  const messages = []; const runtime = createWorkerRuntime({ postMessage: (message) => messages.push(message), scan: async () => { throw new Error('secret source contract X'); } });
  await runtime.handle(createWorkerMessage('scan-request', 'r1', { scanInput: {}, limits: {} }));
  assert.equal(messages[0].messageType, 'error'); assert.equal(JSON.stringify(messages[0]).includes('secret'), false);
});
test('abort cancels active scan and leaves no active request', async () => {
  const messages = []; const runtime = createWorkerRuntime({ postMessage: (message) => messages.push(message), scan: (_input, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) });
  const pending = runtime.handle(createWorkerMessage('scan-request', 'r1', { scanInput: {}, limits: {} })); await wait();
  await runtime.handle(createWorkerMessage('abort', 'r1')); await pending;
  assert.equal(runtime.activeRequestId, null); assert.equal(messages.at(-1).payload.code, 'WEB_V4_ABORTED');
});
test('stage timeout is explicit and cleanup completes', async () => {
  const messages = []; const runtime = createWorkerRuntime({ postMessage: (message) => messages.push(message), scan: (_input, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) });
  await runtime.handle(createWorkerMessage('scan-request', 'r1', { scanInput: {}, limits: { stageTimeoutMs: 5, globalTimeoutMs: 20 } }));
  assert.equal(messages.at(-1).payload.code, 'WEB_V4_TIMEOUT'); assert.equal(runtime.activeRequestId, null);
});
