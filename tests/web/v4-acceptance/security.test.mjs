import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = ['apps/web/v4/ui.js', 'apps/web/v4/input-adapter.js', 'apps/web/v4/report-adapter.js', 'apps/web/v4/persistence.js', 'apps/web/v4/export-adapter.js', 'apps/web/v4/runtime/worker-client.js'];
const source = files.map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
test('V4 web path has no upload, analytics, remote import, unsafe eval, or source logging primitive', () => {
  for (const forbidden of ['XMLHttpRequest', 'sendBeacon(', 'analytics', 'new Function', 'eval(', "from 'http", 'console.log']) assert.equal(source.includes(forbidden), false, forbidden);
  assert.doesNotMatch(source, /fetch\s*\(\s*['"]https?:/u);
});
test('worker is a CSP-compatible module worker and UI output uses escaping', () => {
  assert.match(source, /new Worker\(new URL\([^)]*import\.meta\.url\), \{ type: 'module'/u);
  assert.match(source, /const esc =/u); assert.match(source, /replaceAll\('<', '&lt;'\)/u);
});
test('browser artifacts contain no absolute checkout root or username', () => {
  const manifest = fs.readFileSync(path.join(root, 'dist-preview-v4', 'v4', 'veilforge-v4-scanner.worker.manifest.json'), 'utf8');
  assert.equal(manifest.includes(root), false); if (process.env.USERNAME) assert.equal(manifest.includes(process.env.USERNAME), false);
});
