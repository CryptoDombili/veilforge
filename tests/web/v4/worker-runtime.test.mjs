import test from 'node:test';
import assert from 'node:assert/strict';
import { webV4Error } from '../../../apps/web/v4/errors.js';
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
test('worker preserves safe compilation diagnostics and request identity', async () => {
  const messages = []; const runtime = createWorkerRuntime({ postMessage: (message) => messages.push(message), scan: async () => { throw webV4Error('WEB_V4_COMPILE_FAILED', 'PRIVATE_SOURCE', { failureType: 'compile', stage: 'compilation', causeCode: 'COMPILER_DIAGNOSTIC_ERROR', diagnosticCount: 1, compilerDiagnostics: [{ type: 'ParserError', severity: 'error', errorCode: '2314', message: 'PRIVATE_SOURCE' }] }); } });
  await runtime.handle(createWorkerMessage('scan-request', 'compile-r1', { scanInput: {}, limits: {} }));
  const payload = messages[0].payload;
  assert.equal(payload.code, 'WEB_V4_COMPILE_FAILED');
  assert.deepEqual({ failureType: payload.diagnostic.failureType, stage: payload.diagnostic.stage, requestId: payload.diagnostic.requestId, causeCode: payload.diagnostic.causeCode, diagnosticCount: payload.diagnostic.diagnosticCount }, { failureType: 'compile', stage: 'compilation', requestId: 'compile-r1', causeCode: 'COMPILER_DIAGNOSTIC_ERROR', diagnosticCount: 1 });
  assert.deepEqual(payload.diagnostic.compilerDiagnostics, [{ type: 'ParserError', severity: 'error', errorCode: '2314' }]);
  assert.equal(JSON.stringify(payload).includes('PRIVATE_SOURCE'), false);
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
