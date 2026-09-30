import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { probeForbiddenCspResources } from '../../scripts/lib/csp-negative-probe.mjs';

async function probe({ script = 'error', worker = 'error', violations = [] } = {}) {
  let scriptRemoved = false;
  let workerTerminated = false;
  let errorPrevented = false;
  const context = vm.createContext({
    setTimeout, clearTimeout, encodeURIComponent,
    __VEILFORGE_CSP_VIOLATIONS__: [],
    document: {
      createElement() { return { remove() { scriptRemoved = true; } }; },
      head: {
        append(element) {
          assert.match(element.src, /^data:text\/javascript;charset=utf-8,/u);
          assert.equal(typeof element.onload, 'function');
          assert.equal(typeof element.onerror, 'function');
          setTimeout(() => {
            context.__VEILFORGE_CSP_VIOLATIONS__.push(...violations);
            if (script === 'load' || script === 'execution-with-error') vm.runInContext(decodeURIComponent(element.src.split(',')[1]), context);
            if (script === 'load') element.onload?.();
            else if (script !== 'silent') element.onerror?.();
          }, 0);
        },
      },
    },
    Worker: class {
      constructor(url) {
        assert.match(url, /^data:text\/javascript;charset=utf-8,/u);
        assert.match(decodeURIComponent(url.split(',')[1]), /postMessage/u);
        if (worker === 'throw') throw new Error('CSP blocked');
        setTimeout(() => {
          if (worker === 'message') this.onmessage?.({ data: 'executed' });
          else if (worker === 'message-error') this.onmessageerror?.({});
          else if (worker === 'error') this.onerror?.({ preventDefault() { errorPrevented = true; } });
        }, 0);
      }
      terminate() { workerTerminated = true; }
    },
  });
  const result = await vm.runInContext(`(${probeForbiddenCspResources.toString()})({ timeoutMs: 100 })`, context);
  assert.equal(scriptRemoved, true);
  assert.equal(workerTerminated, worker !== 'throw');
  assert.equal('__VEILFORGE_UNAUTHORIZED_SCRIPT_EXECUTED__' in context, false);
  if (worker === 'error') assert.equal(errorPrevented, true);
  return result;
}

test('CSP probe accepts asynchronous script and worker errors without violation events', async () => {
  const result = await probe();
  assert.equal(result.scriptBlocked, true);
  assert.equal(result.workerBlocked, true);
  assert.equal(result.violations.length, 0);
});

test('CSP probe accepts synchronous worker rejection and preserves optional violation diagnostics', async () => {
  const violations = [{ effectiveDirective: 'script-src-elem', blockedURI: 'data:' }];
  const result = await probe({ worker: 'throw', violations });
  assert.equal(result.scriptBlocked, true);
  assert.equal(result.workerBlocked, true);
  assert.deepEqual(Array.from(result.violations), violations);
});

test('CSP probe rejects a successful forbidden script load or execution', async () => {
  for (const script of ['load', 'execution-with-error']) {
    assert.equal((await probe({ script })).scriptBlocked, false);
  }
});

test('CSP probe rejects any forbidden worker message', async () => {
  assert.equal((await probe({ worker: 'message' })).workerBlocked, false);
});

test('CSP probe fails closed on message decode failure or bounded timeout', async () => {
  assert.equal((await probe({ worker: 'message-error' })).workerBlocked, false);
  const result = await probe({ script: 'silent', worker: 'silent', violations: [{ effectiveDirective: 'worker-src', blockedURI: 'data:' }] });
  assert.equal(result.scriptBlocked, false);
  assert.equal(result.workerBlocked, false);
});
