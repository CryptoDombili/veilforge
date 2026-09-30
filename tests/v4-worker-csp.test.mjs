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
  const probe = fs.readFileSync(new URL('../scripts/lib/csp-negative-probe.mjs', import.meta.url), 'utf8');
  assert.match(smoke, /securitypolicyviolation/u);
  assert.match(smoke, /unauthorized\.invalid/u);
  assert.match(smoke, /data:text\/javascript/u);
  assert.match(smoke, /assets\.reachableModules/u);
  assert.match(smoke, /SmokeTest\.sol/u);
  assert.match(crossBrowser, /securitypolicyviolation/u);
  assert.match(crossBrowser, /dist-mainnet-production/u);
  assert.match(crossBrowser, /import\s*\{\s*probeForbiddenCspResources\s*\}\s*from\s*['"]\.\/lib\/csp-negative-probe\.mjs['"]/u);
  assert.match(crossBrowser, /page\.evaluate\(probeForbiddenCspResources\)/u);
  assert.match(crossBrowser, /if\s*\(!cspProbe\.scriptBlocked\s*\|\|\s*!cspProbe\.workerBlocked\)\s*throw/u);
  assert.match(probe, /script\.src\s*=\s*`data:text\/javascript;charset=utf-8,/u);
  assert.match(probe, /new Worker\(`data:text\/javascript;charset=utf-8,/u);
  assert.match(probe, /globalThis\.\$\{marker\}=true;/u);
  assert.match(probe, /postMessage\("veilforge-csp-probe-executed"\)/u);
  assert.match(probe, /script\.onload\s*=\s*\(\)\s*=>\s*finish\('load'\)/u);
  assert.match(probe, /script\.onerror\s*=\s*\(\)\s*=>\s*finish\('error'\)/u);
  assert.match(probe, /worker\.onmessage\s*=\s*\(\)\s*=>\s*finish\('message'\)/u);
  assert.match(probe, /worker\.onerror\s*=[^\n]*finish\('error'\)/u);
  assert.equal((probe.match(/setTimeout\(\(\)\s*=>\s*finish\('timeout'\),\s*timeoutMs\)/gu) ?? []).length, 2);
  assert.match(probe, /blocked:\s*outcome === 'error' && globalThis\[marker\] !== true/u);
  assert.match(probe, /blocked:\s*outcome === 'constructor-error' \|\| outcome === 'error'/u);
  assert.match(probe, /scriptBlocked:\s*script\.blocked && !scriptExecuted/u);
  assert.match(probe, /workerBlocked:\s*worker\.blocked/u);
});
