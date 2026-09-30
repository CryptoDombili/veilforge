import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startArcMainnetProductionServer } from '../../scripts/serve-arc-mainnet-production.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/web');

test('AUDIT-ROUND2-LOW-CSP-01 production-like HTTP responses enforce CSP and anti-framing', async (t) => {
  const server = await startArcMainnetProductionServer({ root });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  for (const [route, expectedStatus] of [['/', 200], ['/app/', 200], ['/app', 308], ['/whitepaper', 308]]) {
    const response = await fetch(`${origin}${route}`, { redirect: 'manual' });
    assert.equal(response.status, expectedStatus);
    const csp = response.headers.get('content-security-policy');
    assert.match(csp, /frame-ancestors 'none'/u);
    assert.match(csp, /script-src 'self'/u);
    assert.match(csp, /script-src[^;]*'wasm-unsafe-eval'/u);
    assert.match(csp, /connect-src 'self' https:\/\/rpc\.mainnet\.arc\.io https:\/\/explorer\.arc\.io/u);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-(?:inline|eval)'/u);
    assert.doesNotMatch(csp, /worker-src[^;]*(?:data:|\*)/u);
    assert.doesNotMatch(csp, /\b(?:default|script|connect)-src[^;]*\*/u);
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }
});
