import test from 'node:test';
import assert from 'node:assert/strict';
import { assertWorkerMessage, createWorkerMessage, safeProgressPayload, semanticScanPayload, WORKER_MESSAGE_TYPES } from '../../../apps/web/v4/runtime/protocol.js';

test('all required worker message types use protocol v1 envelope', () => {
  for (const type of WORKER_MESSAGE_TYPES) assert.equal(assertWorkerMessage(createWorkerMessage(type, 'request-1')).protocolVersion, 'veilforge.web-worker.v1');
});
test('protocol mismatch is rejected', () => assert.throws(() => assertWorkerMessage({ ...createWorkerMessage('ready', 'worker'), protocolVersion: 'v0' }), { code: 'WEB_V4_PROTOCOL_MISMATCH' }));
test('progress payload excludes source and arbitrary properties', () => assert.deepEqual(safeProgressPayload({ stage: 'compile', percent: 50, source: 'secret', path: 'C:\\secret.sol' }), { stage: 'compile', percent: 50 }));
test('semantic scan payload excludes requestId and operational timestamps', () => {
  const payload = semanticScanPayload({ projectId: 'p', sources: { 'A.sol': { content: 'x' } } }, { stageTimeoutMs: 1, globalTimeoutMs: 2 });
  assert.equal('requestId' in payload, false); assert.equal('createdAt' in payload, false);
});
