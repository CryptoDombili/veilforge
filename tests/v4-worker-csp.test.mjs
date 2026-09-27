import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertWebV4ProductionCsp } from '../scripts/lib/web-v4-runtime-assets.mjs';

const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const csp = vercel.headers.find((item) => item.source === '/(.*)').headers.find((item) => item.key === 'Content-Security-Policy').value;

test('production CSP narrowly enables pinned compiler WebAssembly without JavaScript eval', () => {
  assert.deepEqual(assertWebV4ProductionCsp(csp), { effectiveDirective: 'script-src', compilerBlockedUri: 'wasm-eval', wasmCompilationAllowed: true });
  assert.match(csp, /default-src 'self'/u);
  assert.match(csp, /object-src 'none'/u);
  assert.match(csp, /frame-ancestors 'none'/u);
  assert.doesNotMatch(csp, /(?:^|\s)'unsafe-eval'(?:\s|;|$)/u);
  assert.doesNotMatch(csp, /script-src[^;]*(?:data:|blob:|https?:\/\/|\*)/u);
  assert.doesNotMatch(csp, /worker-src[^;]*(?:data:|https?:\/\/|\*)/u);
});

test('production CSP validator rejects unsafe or incomplete scanner policies', () => {
  const base = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:";
  assert.throws(() => assertWebV4ProductionCsp(base.replace(" 'wasm-unsafe-eval'", '')), /script-src/u);
  assert.throws(() => assertWebV4ProductionCsp(base.replace("'wasm-unsafe-eval'", "'unsafe-eval'")), /script-src/u);
  assert.throws(() => assertWebV4ProductionCsp(base.replace("worker-src 'self' blob:", "worker-src 'self' data:")), /worker-src/u);
});

test('production browser regression uses built modules, exact hosting CSP and negative probes', () => {
  const smoke = fs.readFileSync(new URL('../scripts/smoke-arc-mainnet-production-v4-csp.mjs', import.meta.url), 'utf8');
  const crossBrowser = fs.readFileSync(new URL('../scripts/smoke-web-v4-cross-browser.mjs', import.meta.url), 'utf8');
  for (const source of [smoke, crossBrowser]) {
    assert.match(source, /securitypolicyviolation/u);
    assert.match(source, /unauthorized\.invalid/u);
    assert.match(source, /data:text\/javascript/u);
  }
  assert.match(smoke, /assets\.reachableModules/u);
  assert.match(smoke, /SmokeTest\.sol/u);
  assert.match(crossBrowser, /dist-mainnet-production/u);
});
