import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { v4ErrorMessage, v4UiTemplate } from '../../../apps/web/v4/ui.js';

const uiSource = fs.readFileSync(new URL('../../../apps/web/v4/ui.js', import.meta.url), 'utf8');

test('preview exposes scan, cancel, progress, recovery, verified history and export controls', () => {
  const html = v4UiTemplate();
  for (const id of ['v4-scan', 'v4-cancel', 'v4-progress', 'v4-status', 'v4-history', 'v4-clear-history', 'v4-export', 'v4-detail']) assert.match(html, new RegExp(`id="${id}"`, 'u'));
  assert.match(html, /Deterministic Solidity analysis runs locally in an isolated worker\./u); assert.match(html, /1 MiB MAX/u); assert.match(html, /Source never leaves this browser/u);
});

test('UI verifies before render/persist and always unlocks after lifecycle errors', () => {
  assert.ok(uiSource.indexOf('await verifyV4Report') < uiSource.indexOf('await saveV4Report'));
  const lifecycle = uiSource.slice(uiSource.indexOf('const client = createWorkerClient()'), uiSource.indexOf('const resetCurrentSession'));
  assert.match(lifecycle, /finally\s*\{/u);
  assert.match(lifecycle, /client\.dispose\(\)/u);
  assert.match(lifecycle, /if \(state\.client === client\) state\.client = null/u);
  assert.match(lifecycle, /if \(runId === state\.runId\)\s*\{\s*setBusy\(false\);\s*updateWorkflow\(\);\s*\}/u);
  const resetLifecycle = uiSource.slice(uiSource.indexOf('const resetCurrentSession'), uiSource.indexOf("byId('v4-file-input').addEventListener"));
  assert.match(resetLifecycle, /const client = state\.client/u);
  assert.match(resetLifecycle, /if \(client\)\s*\{\s*client\.abort\(\);\s*if \(!client\.disposed\) client\.dispose\(\);\s*\}/u);
  assert.match(resetLifecycle, /state\.client = null/u);
  assert.match(resetLifecycle, /setBusy\(false\)/u);
  assert.match(uiSource, /persistenceWarning/u);
});

test('structured recovery messages never repeat raw errors or source', () => {
  const secret = 'C:\\Users\\name\\repo\\PRIVATE_SOURCE';
  for (const code of ['WEB_V4_ABORTED', 'WEB_V4_TIMEOUT', 'WEB_V4_WORKER_CRASH', 'WEB_V4_RUNTIME_UNAVAILABLE', 'WEB_V4_STORAGE_QUOTA', 'WEB_V4_PERSISTENCE_INVALID']) {
    const message = v4ErrorMessage({ code, message: secret });
    assert.doesNotMatch(message, /PRIVATE_SOURCE|C:\\Users/u);
  }
});

test('no query parameter or runtime URL can enable V4 mode', () => {
  const feature = fs.readFileSync(new URL('../../../apps/web/v4/feature-flags.js', import.meta.url), 'utf8');
  assert.match(feature, /DEFAULT_WEB_V4_ENABLED = false/u);
  assert.doesNotMatch(feature, /location|searchParams|querySelector/u);
});
