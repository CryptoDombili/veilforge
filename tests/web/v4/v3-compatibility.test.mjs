import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('apps/web/app.js', 'utf8');
const config = fs.readFileSync('apps/web/config.js', 'utf8');
const html = fs.readFileSync('apps/web/app/index.html', 'utf8');

test('V3 scan, history, export, proof and navigation implementation remains present', () => {
  for (const marker of ["from './engine/index.js'", "from './proof/registry.js'", "veilforge:v3.2:scan-history", 'scanProject(state.files', 'createZip']) assert.ok(app.includes(marker), marker);
  assert.ok(html.includes('data-view'));
});
test('site remains labeled 3.2.2 and V4 flag is only a disabled config hook', () => {
  assert.match(config, /BUILD_VERSION = '3\.2\.2'/u); assert.match(config, /WEB_V4_ENABLED = false/u);
  const scanBody = app.slice(app.indexOf('async function runScan()'), app.indexOf('function download('));
  assert.ok(scanBody.indexOf('if (WEB_V4_ENABLED)') < scanBody.indexOf('scanProject(state.files'));
  assert.match(scanBody, /await runV4FoundationScan\(\);\s+return;/u);
});
