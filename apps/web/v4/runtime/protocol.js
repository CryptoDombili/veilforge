import { safeWorkerError, webV4Error } from '../errors.js';
import { WEB_V4_PROTOCOL_VERSION } from '../version.js';

export const WORKER_MESSAGE_TYPES = Object.freeze(['ready', 'scan-request', 'progress', 'result', 'error', 'abort', 'shutdown']);

export function createWorkerMessage(messageType, requestId, payload = {}) {
  if (!WORKER_MESSAGE_TYPES.includes(messageType) || typeof requestId !== 'string' || !requestId || !payload || typeof payload !== 'object' || Array.isArray(payload)) throw webV4Error('WEB_V4_PROTOCOL_INVALID', 'Invalid V4 worker message.');
  return Object.freeze({ protocolVersion: WEB_V4_PROTOCOL_VERSION, requestId, messageType, payload: Object.freeze({ ...payload }) });
}

export function assertWorkerMessage(message) {
  if (message?.protocolVersion !== WEB_V4_PROTOCOL_VERSION) throw webV4Error('WEB_V4_PROTOCOL_MISMATCH', 'V4 worker protocol version mismatch.');
  if (!WORKER_MESSAGE_TYPES.includes(message.messageType) || typeof message.requestId !== 'string' || !message.requestId || !message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload)) throw webV4Error('WEB_V4_PROTOCOL_INVALID', 'Invalid V4 worker message.');
  return message;
}

export function safeProgressPayload(value = {}) {
  const result = {};
  if (typeof value.stage === 'string') result.stage = value.stage.slice(0, 64);
  if (typeof value.status === 'string') result.status = value.status.slice(0, 32);
  if (Number.isFinite(value.percent)) result.percent = Math.max(0, Math.min(100, value.percent));
  if (Number.isFinite(value.durationMs)) result.durationMs = Math.max(0, value.durationMs);
  return Object.freeze(result);
}

export const errorMessage = (requestId, error) => createWorkerMessage('error', requestId || 'worker', safeWorkerError(error));

export function semanticScanPayload(scanInput, limits) {
  return Object.freeze({ scanInput, limits: Object.freeze({ stageTimeoutMs: limits.stageTimeoutMs, globalTimeoutMs: limits.globalTimeoutMs }) });
}
