import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const harness = fs.readFileSync(new URL('../../scripts/smoke-web-v4-cross-browser.mjs', import.meta.url), 'utf8');
const declaration = harness.match(/^const stageLimits = Object\.freeze\([^\r\n]+\);$/mu)?.[0];
assert.ok(declaration, 'The browser harness must define bounded stage limits.');

for (const [browser, pageTimeout] of [['chromium', 5_000], ['firefox', 5_000], ['webkit', 15_000], ['edge', 15_000]]) {
  test(`${browser} retains the expected bounded startup and acceptance limits`, () => {
    const limits = vm.runInNewContext(`${declaration}\nstageLimits`, { requestedBrowser: browser });
    assert.equal(Object.isFrozen(limits), true);
    assert.deepEqual({ ...limits }, {
      launch: 15_000, context: 5_000, page: pageTimeout, navigation: 15_000,
      app: 15_000, scan: 30_000, cleanup: 3_000, shutdown: 5_000,
    });
  });
}

test('real Edge uses msedge and bounded page-target creation still fails closed', async () => {
  assert.match(harness, /if \(requestedBrowser === 'edge'\) launchOptions\.channel = 'msedge';/u);
  assert.match(harness, /page = await bounded\('PAGE_TARGET_CREATED', stageLimits\.page, \(\) => context\.newPage\(\)\);/u);
  const start = harness.indexOf('async function bounded(');
  const end = harness.indexOf('\nasync function waitForScan(', start);
  assert.ok(start >= 0 && end > start, 'Exercise the actual harness timeout boundary.');
  let timeout;
  let cleared;
  let passed = false;
  const context = vm.createContext({
    requestedBrowser: 'edge', currentStage: null,
    performance: { now: () => 0 },
    record() { passed = true; },
    setTimeout(callback, delay) { timeout = { callback, delay }; return timeout; },
    clearTimeout(timer) { cleared = timer; },
  });
  const pending = vm.runInContext(`${declaration}\n${harness.slice(start, end)}\nbounded('PAGE_TARGET_CREATED', stageLimits.page, () => new Promise(() => {}));`, context);
  assert.equal(timeout.delay, 15_000);
  timeout.callback();
  await assert.rejects(pending, (error) => error.code === 'PAGE_TARGET_CREATED_TIMEOUT');
  assert.equal(context.currentStage, 'PAGE_TARGET_CREATED');
  assert.equal(passed, false);
  assert.equal(cleared, timeout);
});
