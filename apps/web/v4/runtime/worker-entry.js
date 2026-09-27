import { classifyWorkerFailure, safeWorkerError } from '../errors.js';
import { createWorkerMessage } from './protocol.js';

const scope = globalThis;
let runtime = null;
let failureReported = false;

function reportFailure(value, stage, assetPath = null) {
  if (failureReported) return;
  failureReported = true;
  const error = classifyWorkerFailure(value, { stage, assetPath });
  const requestId = runtime?.activeRequestId ?? 'worker';
  try { scope.postMessage(createWorkerMessage('error', requestId, safeWorkerError(error, error.code, { requestId }))); } catch {}
}

scope.addEventListener?.('error', (event) => {
  event.preventDefault?.();
  reportFailure(event?.error ?? event, runtime ? 'runtime' : 'initialization', event?.filename);
});
scope.addEventListener?.('unhandledrejection', (event) => {
  event.preventDefault?.();
  reportFailure(event?.reason ?? event, runtime ? 'runtime' : 'initialization');
});

async function bootstrap() {
  try {
    const [{ VeilForgeV4BrowserRuntime }, { createWorkerRuntime }] = await Promise.all([
      import('./browser-scanner-entry.js'),
      import('./worker-runtime.js'),
    ]);
    const scanner = typeof VeilForgeV4BrowserRuntime?.scanProject === 'function'
      ? VeilForgeV4BrowserRuntime.scanProject.bind(VeilForgeV4BrowserRuntime)
      : null;
    runtime = createWorkerRuntime({ postMessage: (message) => scope.postMessage(message), scan: scanner, terminate: () => scope.close?.() });
    scope.onmessage = (event) => runtime.handle(event.data);
    runtime.start();
  } catch (error) {
    reportFailure(error, 'initialization', 'v4/runtime/worker-entry.js');
  }
}

void bootstrap();
