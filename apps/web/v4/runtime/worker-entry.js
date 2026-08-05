import { createWorkerRuntime } from './worker-runtime.js';

const scope = globalThis;
const scanner = typeof scope.VeilForgeV4BrowserRuntime?.scanProject === 'function'
  ? scope.VeilForgeV4BrowserRuntime.scanProject.bind(scope.VeilForgeV4BrowserRuntime)
  : null;
const runtime = createWorkerRuntime({ postMessage: (message) => scope.postMessage(message), scan: scanner, terminate: () => scope.close?.() });
scope.onmessage = (event) => runtime.handle(event.data);
runtime.start();
