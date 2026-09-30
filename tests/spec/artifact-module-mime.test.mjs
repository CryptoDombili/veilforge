import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createArtifactModuleMimeCheck } from '../../scripts/lib/artifact-module-mime.mjs';

const origin = 'http://127.0.0.1:4176';
const generatedFiles = [
  'app.js', 'config.js', 'v4/ui.js', 'v4/veilforge-v4-scanner.worker.js',
  'v4/runtime/browser-runtime-assets/engine/v4/orchestration/index.js',
  'lib/shared.mjs', 'lib/legacy.cjs', 'styles.css', 'app/index.html',
];
const hasFailure = createArtifactModuleMimeCheck({ origin, generatedFiles });
const response = (url, mime = 'text/javascript', status = 200) => ({
  url: () => new URL(url, origin).href,
  status: () => status,
  headers: () => mime === undefined ? {} : { 'content-type': mime },
});
const harness = fs.readFileSync(new URL('../../scripts/smoke-web-v4-cross-browser.mjs', import.meta.url), 'utf8');

test('every inventoried application module rejects invalid MIME, including application/x-javascript', () => {
  for (const file of generatedFiles.filter((value) => /\.(?:c?js|mjs)$/u.test(value))) {
    for (const mime of ['application/x-javascript', 'text/plain', 'text/html', 'application/json', '']) {
      assert.equal(hasFailure(response(`/${file}?cache=1`, mime)), true, `${file}: ${mime}`);
    }
  }
  assert.equal(hasFailure(response('/v4/%75i.js', 'application/x-javascript')), true);
});

test('valid JavaScript MIME stays accepted and non-module assets are not modules', () => {
  for (const mime of ['text/javascript', 'application/javascript', 'text/javascript; charset=utf-8']) {
    assert.equal(hasFailure(response('/v4/ui.js', mime)), false);
  }
  assert.equal(hasFailure(response('/styles.css', 'text/css')), false);
});

test('unrelated injected scripts are not artifact modules regardless of GUID or MIME', () => {
  for (const url of [
    '/FD126C42-EBFA-4E12-B309-BB3FDD723AC1/main.js',
    '/00000000-0000-4000-8000-000000000000/main.js',
    '/unrelated-runner/probe.js',
    'https://unrelated.invalid/v4/ui.js',
  ]) assert.equal(hasFailure(response(url, 'application/x-javascript')), false);
});

test('missing or malformed artifact module inventories fail closed', () => {
  for (const files of [undefined, [], ['styles.css'], ['../app.js'], ['/app.js'], ['v4/../ui.js'], ['v4\\ui.js'], [null]]) {
    assert.throws(() => createArtifactModuleMimeCheck({ origin, generatedFiles: files }), /Artifact MIME validation/u);
  }
});

test('the actual harness counts invalid artifact MIME and preserves its strict 404 and CSP gates', () => {
  assert.match(harness, /import \{ createArtifactModuleMimeCheck \} from '\.\/lib\/artifact-module-mime\.mjs';/u);
  assert.match(harness, /generatedFiles: JSON\.parse\(fs\.readFileSync\(path\.join\(artifact, 'build-manifest\.json'\), 'utf8'\)\)\.generatedFiles/u);
  const listeners = [];
  const result = { module404s: 0, asset404s: 0, moduleMimeFailures: 0 };
  const context = vm.createContext({
    URL, result, hasArtifactModuleMimeFailure: hasFailure,
    page: { on(event, handler) { assert.equal(event, 'response'); listeners.push(handler); } },
  });
  vm.runInContext(harness.slice(harness.indexOf("  page.on('response',"), harness.indexOf("  page.on('worker',")), context);
  for (const resource of [response('/v4/ui.js', 'text/plain'), response('/unrelated/main.js', 'application/x-javascript'), response('/v4/ui.js', 'text/plain', 404), response('/v4/soljson-v0.8.24.js', 'text/plain', 404), response('/assets/missing.png', 'text/plain', 404)]) {
    for (const listener of listeners) listener(resource);
  }
  assert.deepEqual(result, { module404s: 2, asset404s: 1, moduleMimeFailures: 1 });
  assert.match(harness, /if \(scannerViolations\.length \|\| result\.moduleMimeFailures\) throw/u);
  assert.match(harness, /if \(!cspProbe\.scriptBlocked \|\| !cspProbe\.workerBlocked\) throw/u);
});
