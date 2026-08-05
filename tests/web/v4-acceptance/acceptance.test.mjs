import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { v4ErrorMessage, v4UiTemplate } from '../../../apps/web/v4/ui.js';

const uiSource = fs.readFileSync(new URL('../../../apps/web/v4/ui.js', import.meta.url), 'utf8');

test('preview exposes scan, cancel, progress, recovery, verified history and export controls', () => {
  const html = v4UiTemplate();
  for (const id of ['v4-scan', 'v4-cancel', 'v4-progress', 'v4-status', 'v4-history', 'v4-clear-history', 'v4-export', 'v4-detail']) assert.match(html, new RegExp(`id="${id}"`, 'u'));
  assert.match(html, /Web Worker/u); assert.match(html, /1 MiB PROJECT LIMIT/u); assert.match(html, /Source is not uploaded/u);
});

test('UI verifies before render/persist and always unlocks after lifecycle errors', () => {
  assert.ok(uiSource.indexOf('await verifyV4Report') < uiSource.indexOf('await saveV4Report'));
  assert.match(uiSource, /finally \{ state\.client\?\.dispose\(\); state\.client = null; setBusy\(false\); \}/u);
  assert.match(
    uiSource,
    /state\.client\.abort\(\);\s+if \(!state\.client\.disposed\) state\.client\.dispose\(\);/u,
  );
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
