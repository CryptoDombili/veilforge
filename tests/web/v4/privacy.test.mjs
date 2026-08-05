import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function files(directory) { return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]); }

test('V4 web foundation has no network upload, source logging or unsafe eval', () => {
  const source = files('apps/web/v4').filter((file) => file.endsWith('.js')).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/u);
  assert.doesNotMatch(source, /console\.(?:log|debug|info|warn|error)/u);
  assert.doesNotMatch(source, /\beval\s*\(|new Function/u);
});
test('worker errors do not retain arbitrary exception messages or absolute paths', async () => {
  const { safeWorkerError } = await import('../../../apps/web/v4/errors.js');
  const value = safeWorkerError(new Error('contract Secret at C:\\Users\\name\\Case.sol'));
  assert.equal(JSON.stringify(value).includes('Secret'), false); assert.equal(JSON.stringify(value).includes('C:'), false);
});
