import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd(); const preview = path.join(root, 'dist-preview-v4');
test('preview build is isolated and true while production/default config remains false', () => {
  assert.match(fs.readFileSync(path.join(preview, 'config.js'), 'utf8'), /WEB_V4_ENABLED = true/u);
  assert.match(fs.readFileSync(path.join(root, 'apps', 'web', 'config.js'), 'utf8'), /WEB_V4_ENABLED = false/u);
  assert.notEqual(path.resolve(preview), path.resolve(root, 'dist'));
});
test('runtime manifest carries pinned digests and stale protocol fails closed', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(preview, 'v4', 'veilforge-v4-scanner.worker.manifest.json'), 'utf8'));
  assert.equal(manifest.compilerVersion, '0.8.24'); assert.match(manifest.compilerDigest, /^sha256:/u); assert.match(manifest.workerDigest, /^sha256:/u);
  const protocol = fs.readFileSync(path.join(root, 'apps', 'web', 'v4', 'runtime', 'protocol.js'), 'utf8'); assert.match(protocol, /WEB_V4_PROTOCOL_MISMATCH/u);
});
test('no service worker can retain a stale V4 runtime across rollback', () => {
  const files = []; const walk = (directory) => { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const absolute = path.join(directory, entry.name); if (entry.isDirectory()) walk(absolute); else files.push(absolute); } }; walk(path.join(root, 'apps', 'web'));
  assert.equal(files.some((file) => /(?:service-worker|sw)\.js$/iu.test(path.basename(file))), false);
});
