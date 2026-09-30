import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../scripts/smoke-browser.mjs', import.meta.url), 'utf8');
const waiter = source.slice(source.indexOf('function waitForBytecodeState('), source.indexOf('\nfunction stripModuleSyntax('));
const readiness = source.slice(source.indexOf('      const bytecodeArtifactReady ='), source.indexOf('\n      const bytecodeVerifyControl ='));

function browserContext(globals = {}) {
  const observers = [];
  const timers = [];
  const context = vm.createContext({
    document: { body: {} },
    MutationObserver: class {
      constructor(check) { this.check = check; observers.push(this); }
      observe(_target, options) { assert.equal(options.subtree, true); assert.equal(options.attributes, true); }
      disconnect() { this.disconnected = true; }
    },
    setTimeout(callback, delay) { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimeout(timer) { timer.cleared = true; },
    ...globals,
  });
  vm.runInContext(waiter, context);
  return { context, timers, observers, notify() { for (const observer of observers) if (!observer.disconnected) observer.check(); } };
}

test('Bytecode Truth checks immediate readiness without an arbitrary delay and cleans up', async () => {
  const browser = browserContext();
  assert.equal(await browser.context.waitForBytecodeState('artifact readiness', () => 'ready'), 'ready');
  assert.equal(browser.timers[0].delay, 5_000);
  assert.equal(browser.timers[0].cleared, true);
  assert.equal(browser.observers[0].disconnected, true);
});

test('delayed artifact rendering must expose Payroll.json and an actionable fresh Verify control', async () => {
  let loaded = false;
  let visible = true;
  const control = { isConnected: true, disabled: true, getClientRects: () => visible ? [{}] : [] };
  const browser = browserContext({
    document: { body: {}, querySelector(selector) {
      return selector === '.artifact-card header strong' ? loaded ? { textContent: 'Payroll.json' } : null : control;
    } },
    getComputedStyle: () => ({ visibility: 'visible' }),
  });
  const predicate = vm.runInContext(`${readiness}\nbytecodeArtifactReady`, browser.context);
  const pending = browser.context.waitForBytecodeState('artifact/UI readiness', predicate);
  loaded = true;
  browser.notify();
  assert.equal(predicate(), false, 'Loading a file alone must not bypass a disabled control.');
  control.disabled = false;
  visible = false;
  browser.notify();
  assert.equal(predicate(), false, 'A hidden control is not actionable.');
  visible = true;
  control.isConnected = false;
  assert.equal(predicate(), false, 'Do not click a stale detached control.');
  control.isConnected = true;
  browser.notify();
  assert.equal(await pending, control);
  assert.equal(browser.timers[0].cleared, true);
});

test('missing readiness fails closed at the bounded timeout with a clear stage label', async () => {
  const browser = browserContext();
  const pending = browser.context.waitForBytecodeState('artifact/UI readiness', () => false);
  browser.timers[0].callback();
  await assert.rejects(pending, (error) => error.code === 'BYTECODE_TRUTH_STATE_TIMEOUT' && /artifact\/UI readiness.*5000ms/u.test(error.message));
  assert.equal(browser.observers[0].disconnected, true);
  assert.equal(browser.timers[0].cleared, true);
});

test('Arc completion waits for both observed RPC activity and the rendered verified result', async () => {
  let status = 'UNVERIFIED';
  const methods = [];
  const browser = browserContext({ bytecodeRpcMethods: methods, document: { body: {}, querySelector: () => ({ textContent: status }) } });
  const start = source.indexOf("        await waitForBytecodeState('Arc verification completion");
  const completion = source.slice(start, source.indexOf('\n        bytecodeStatus =', start));
  const pending = vm.runInContext(`(async () => { ${completion} return true; })()`, browser.context);
  methods.push('eth_chainId');
  browser.notify();
  assert.notEqual(browser.timers[0].cleared, true, 'RPC activity alone is not completion.');
  methods.push('eth_getCode', 'eth_getStorageAt');
  status = 'ARC VERIFIED';
  browser.notify();
  assert.equal(await pending, true);
});

test('wrong-network completion requires RPC activity, UNVERIFIED and a rendered mismatch', async () => {
  let status = 'ARC VERIFIED';
  let error = '';
  const methods = [];
  const browser = browserContext({ bytecodeRejectMethods: methods, document: { body: {}, querySelector: (selector) => ({ textContent: selector === '.bytecode-error' ? error : status }) } });
  const start = source.indexOf("        await waitForBytecodeState('wrong-network rejection completion");
  const completion = source.slice(start, source.indexOf('\n        bytecodeRejectedStatus =', start));
  const pending = vm.runInContext(`(async () => { ${completion} return true; })()`, browser.context);
  methods.push('eth_chainId');
  browser.notify();
  assert.notEqual(browser.timers[0].cleared, true);
  status = 'UNVERIFIED';
  error = 'RPC network mismatch';
  browser.notify();
  assert.equal(await pending, true);
  assert.deepEqual(methods, ['eth_chainId']);
});

test('legacy smoke preserves Testnet expectations, RPC assertions and mock cleanup', () => {
  const interaction = source.slice(source.indexOf("      openView('bytecode');"), source.indexOf("      openView('prooftest');"));
  assert.match(interaction, /await waitForBytecodeState\('artifact\/UI readiness/u);
  assert.ok(interaction.indexOf('await waitForBytecodeState') < interaction.indexOf("document.querySelector('#bytecode-target-address').value"));
  assert.match(interaction, /request\.method === 'eth_chainId' \? '0x4CEF52'/u);
  assert.match(interaction, /bytecodeVerifyControl\.click\(\)/u);
  assert.match(interaction, /bytecodeRejectControl\.click\(\)/u);
  assert.match(interaction, /finally\s*\{\s*globalThis\.fetch = originalFetch;/u);
  assert.doesNotMatch(interaction, /setTimeout|attempt < 40|\?\.click/u);
  assert.match(source, /bytecodeRpcMethods\?\.\[0\] !== 'eth_chainId' \|\| !interactions\?\.bytecodeRpcMethods\?\.includes\('eth_getCode'\)/u);
  assert.match(source, /JSON\.stringify\(interactions\?\.bytecodeRejectMethods\) !== JSON\.stringify\(\['eth_chainId'\]\)/u);
  assert.match(source, /if \(interactionResult\.exceptionDetails\)\s*\{\s*throw new Error/u);
});
