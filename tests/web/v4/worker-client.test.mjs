import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWorkerFailure, safeWorkerError } from '../../../apps/web/v4/errors.js';
import { createWorkerMessage } from '../../../apps/web/v4/runtime/protocol.js';
import { createWorkerClient } from '../../../apps/web/v4/runtime/worker-client.js';
import { wait } from './helpers.mjs';

class FakeWorker {
  constructor(mode = 'result') { this.mode = mode; this.messages = []; this.terminated = false; queueMicrotask(() => this.onmessage?.({ data: createWorkerMessage('ready', 'worker', { available: true }) })); }
  postMessage(message) {
    this.messages.push(message);
    if (message.messageType === 'scan-request' && this.mode === 'result') queueMicrotask(() => { this.onmessage?.({ data: createWorkerMessage('progress', message.requestId, { stage: 'compile' }) }); this.onmessage?.({ data: createWorkerMessage('result', message.requestId, { result: { ok: true } }) }); });
    if (message.messageType === 'scan-request' && this.mode === 'compile-error') queueMicrotask(() => this.onmessage?.({ data: createWorkerMessage('error', message.requestId, { code: 'WEB_V4_COMPILE_FAILED', message: 'Solidity compilation failed under the pinned compiler.', diagnostic: { failureType: 'compile', stage: 'compilation', requestId: message.requestId, causeCode: 'COMPILER_DIAGNOSTIC_ERROR', errorType: 'WebV4Error', diagnosticCount: 1, compilerDiagnostics: [{ type: 'ParserError', severity: 'error', errorCode: '2314' }] } }) }));
  }
  terminate() { this.terminated = true; }
}

test('worker client receives progress and result with one active scan', async () => {
  const worker = new FakeWorker(); const progress = []; const client = createWorkerClient({ workerFactory: () => worker });
  assert.deepEqual(await client.scan({ projectId: 'p' }, { requestId: 'r1', onProgress: (value) => progress.push(value) }), { ok: true });
  assert.equal(progress[0].stage, 'compile'); client.dispose(); assert.equal(worker.terminated, true);
});
test('worker constructor failure is safely classified with only the public worker asset path', () => {
  assert.throws(
    () => createWorkerClient({ workerFactory() { throw new Error('PRIVATE constructor detail'); } }),
    (error) => error.code === 'WEB_V4_WORKER_CONSTRUCTION_FAILED'
      && error.safeDetails.reasonCode === 'WORKER_CONSTRUCTION_FAILED'
      && error.safeDetails.assetPath === 'v4/veilforge-v4-scanner.worker.js'
      && !error.message.includes('PRIVATE'),
  );
});
test('worker asset 404 before ready is safely classified', async () => {
  const worker = { terminate() {}, postMessage() {} };
  const client = createWorkerClient({ workerFactory: () => worker });
  queueMicrotask(() => worker.onerror?.({ message: '404 Not Found: https://preview.invalid/v4/veilforge-v4-scanner.worker.js?secret=hidden', filename: 'https://preview.invalid/v4/veilforge-v4-scanner.worker.js?secret=hidden' }));
  await assert.rejects(client.ready, (error) => error.code === 'WEB_V4_ASSET_NOT_FOUND'
    && error.safeDetails.assetPath === 'v4/veilforge-v4-scanner.worker.js'
    && !JSON.stringify(error.safeDetails).includes('secret'));
});
test('compiler asset initialization failure is preserved as a safe worker message', async () => {
  const worker = { terminate() {}, postMessage() {} };
  const client = createWorkerClient({ workerFactory: () => worker });
  const failure = classifyWorkerFailure(new Error('Failed to fetch PRIVATE compiler URL'), { stage: 'compiler', assetPath: 'v4/soljson-v0.8.24.js' });
  assert.equal(classifyWorkerFailure(failure, { stage: 'initialization', assetPath: 'v4/runtime/worker-entry.js' }).code, 'WEB_V4_COMPILER_LOAD_FAILED');
  queueMicrotask(() => worker.onmessage?.({ data: createWorkerMessage('error', 'worker', safeWorkerError(failure, failure.code)) }));
  await assert.rejects(client.ready, (error) => error.code === 'WEB_V4_COMPILER_LOAD_FAILED'
    && error.safeDetails.reasonCode === 'COMPILER_LOAD_FAILED'
    && error.safeDetails.assetPath === 'v4/soljson-v0.8.24.js'
    && !JSON.stringify(error.safeDetails).includes('PRIVATE'));
});
test('worker message deserialization failure is explicit', async () => {
  const worker = { terminate() {}, postMessage() {} };
  const client = createWorkerClient({ workerFactory: () => worker });
  queueMicrotask(() => worker.onmessageerror?.({ data: 'PRIVATE source payload' }));
  await assert.rejects(client.ready, (error) => error.code === 'WEB_V4_MESSAGE_ERROR'
    && error.safeDetails.reasonCode === 'MESSAGE_ERROR'
    && !JSON.stringify(error.safeDetails).includes('PRIVATE'));
});
test('worker runtime exception after ready rejects the active scan explicitly', async () => {
  const worker = new FakeWorker('hang');
  const client = createWorkerClient({ workerFactory: () => worker });
  const pending = client.scan({ projectId: 'p' }, { requestId: 'runtime-r1' });
  await client.ready;
  queueMicrotask(() => worker.onerror?.({ message: 'PRIVATE runtime exception', filename: 'https://preview.invalid/v4/runtime/worker-entry.js' }));
  await assert.rejects(pending, (error) => error.code === 'WEB_V4_WORKER_RUNTIME_EXCEPTION'
    && error.safeDetails.assetPath === 'v4/runtime/worker-entry.js'
    && !JSON.stringify(error.safeDetails).includes('PRIVATE'));
});
test('CSP, MIME and initialization fetch failures receive distinct safe codes', () => {
  const cases = [
    [new Error("Refused to create a worker because it violates Content Security Policy worker-src 'none'"), 'initialization', 'WEB_V4_CSP_BLOCKED', 'v4/veilforge-v4-scanner.worker.js'],
    [new Error('Module script has a disallowed MIME type text/html'), 'initialization', 'WEB_V4_MIME_MISMATCH', 'v4/veilforge-v4-scanner.worker.js'],
    [new Error('Failed to fetch dynamically imported module: https://preview.invalid/v4/runtime/missing.js?token=PRIVATE'), 'initialization', 'WEB_V4_ASSET_NOT_FOUND', null],
  ];
  for (const [error, stage, code, assetPath] of cases) {
    const classified = classifyWorkerFailure(error, { stage, assetPath });
    assert.equal(classified.code, code);
    assert.match(classified.safeDetails.assetPath, /^v4\//u);
    assert.doesNotMatch(JSON.stringify(classified.safeDetails), /PRIVATE|token=/u);
  }
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
test('worker client preserves safe compile diagnostics from the active request', async () => {
  const worker = new FakeWorker('compile-error'); const client = createWorkerClient({ workerFactory: () => worker });
  await assert.rejects(client.scan({ projectId: 'p' }, { requestId: 'compile-r1' }), (error) => error.code === 'WEB_V4_COMPILE_FAILED' && error.safeDetails.failureType === 'compile' && error.safeDetails.stage === 'compilation' && error.safeDetails.requestId === 'compile-r1' && error.safeDetails.compilerDiagnostics[0].errorCode === '2314');
  client.dispose();
});
