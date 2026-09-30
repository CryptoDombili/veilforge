// Self-contained for Playwright page.evaluate: no Node dependencies or closures.
export async function probeForbiddenCspResources({ timeoutMs = 5000 } = {}) {
  const before = globalThis.__VEILFORGE_CSP_VIOLATIONS__?.length ?? 0;
  const marker = '__VEILFORGE_UNAUTHORIZED_SCRIPT_EXECUTED__';
  globalThis[marker] = false;

  const scriptProbe = new Promise((resolve) => {
    const script = document.createElement('script');
    const finish = (outcome) => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      script.remove();
      resolve({ outcome, blocked: outcome === 'error' && globalThis[marker] !== true });
    };
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    // Register handlers before insertion; even a successful load without a
    // marker is a failure. Silence at the deadline is not evidence of blocking.
    script.onload = () => finish('load');
    script.onerror = () => finish('error');
    script.src = `data:text/javascript;charset=utf-8,${encodeURIComponent(`globalThis.${marker}=true;`)}`;
    document.head.append(script);
  });

  const workerProbe = new Promise((resolve) => {
    let worker;
    const finish = (outcome) => {
      clearTimeout(timer);
      if (worker) {
        worker.onmessage = null;
        worker.onmessageerror = null;
        worker.onerror = null;
        worker.terminate();
      }
      resolve({ outcome, blocked: outcome === 'constructor-error' || outcome === 'error' });
    };
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    try {
      worker = new Worker(`data:text/javascript;charset=utf-8,${encodeURIComponent('postMessage("veilforge-csp-probe-executed");')}`);
      // Firefox can report a CSP denial asynchronously instead of throwing.
      // Any message proves execution, regardless of its payload.
      worker.onmessage = () => finish('message');
      worker.onmessageerror = () => finish('message-error');
      worker.onerror = (event) => { event.preventDefault(); finish('error'); };
    } catch {
      finish('constructor-error');
    }
  });

  const [script, worker] = await Promise.all([scriptProbe, workerProbe]);
  const scriptExecuted = globalThis[marker] === true;
  delete globalThis[marker];
  return {
    violations: (globalThis.__VEILFORGE_CSP_VIOLATIONS__ ?? []).slice(before),
    scriptBlocked: script.blocked && !scriptExecuted,
    workerBlocked: worker.blocked,
    scriptOutcome: script.outcome,
    workerOutcome: worker.outcome,
  };
}
