import { cliError } from './errors.js';

export const WORKER_PROTOCOL_VERSION = '1.0.0';
export const WORKER_MESSAGE_TYPES = Object.freeze(['ready', 'scan-request', 'progress', 'result', 'error', 'abort', 'shutdown']);
export function workerMessage(requestId, messageType, payload = {}) {
  if (!WORKER_MESSAGE_TYPES.includes(messageType)) throw cliError('CLI_WORKER_PROTOCOL_ERROR');
  return { protocolVersion: WORKER_PROTOCOL_VERSION, requestId: requestId ?? null, messageType, payload };
}
export function validateWorkerMessage(message, expectedRequestId = undefined) {
  if (!message || typeof message !== 'object' || message.protocolVersion !== WORKER_PROTOCOL_VERSION || !WORKER_MESSAGE_TYPES.includes(message.messageType)) throw cliError('CLI_WORKER_PROTOCOL_ERROR', { causeCode: 'PROTOCOL_MISMATCH' });
  if (expectedRequestId !== undefined && message.requestId !== expectedRequestId && message.messageType !== 'ready') throw cliError('CLI_WORKER_PROTOCOL_ERROR', { causeCode: 'REQUEST_ID_MISMATCH' });
  return message;
}
