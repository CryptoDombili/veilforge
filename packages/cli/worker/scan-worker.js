import { scanProject } from '../../sdk/src/index.js';
import { WORKER_PROTOCOL_VERSION, validateWorkerMessage, workerMessage } from '../src/worker-protocol.js';

let active = null;
function send(requestId, type, payload = {}) { if (process.connected) process.send(workerMessage(requestId, type, payload)); }
function safeError(error) { return { code: error?.code ?? 'SDK_INTERNAL_ERROR', message: 'The isolated scan failed.', stage: error?.stage ?? null, retryable: Boolean(error?.retryable), causeCode: error?.causeCode ?? null, incompleteReasons: [...(error?.incompleteReasons ?? [])] }; }
process.on('message', async (raw) => {
  let message;
  try { message = validateWorkerMessage(raw, active?.requestId); }
  catch { send(raw?.requestId ?? null, 'error', { code: 'CLI_WORKER_PROTOCOL_ERROR', protocolVersion: WORKER_PROTOCOL_VERSION }); return; }
  if (message.messageType === 'scan-request') {
    if (active) { send(message.requestId, 'error', { code: 'CLI_WORKER_PROTOCOL_ERROR' }); return; }
    const controller = new AbortController(); active = { requestId: message.requestId, controller };
    try {
      const options = { ...(message.payload.options ?? {}), signal: controller.signal, onProgress: (progress) => send(message.requestId, 'progress', progress) };
      const result = await scanProject(message.payload.input, options); send(message.requestId, 'result', result);
    } catch (error) { send(message.requestId, 'error', safeError(error)); }
    finally { active = null; }
  } else if (message.messageType === 'abort') active?.controller.abort('parent-requested-abort');
  else if (message.messageType === 'shutdown') { process.disconnect(); process.exit(0); }
  else send(message.requestId, 'error', { code: 'CLI_WORKER_PROTOCOL_ERROR' });
});
process.on('disconnect', () => process.exit(0));
send(null, 'ready', { protocolVersion: WORKER_PROTOCOL_VERSION });
