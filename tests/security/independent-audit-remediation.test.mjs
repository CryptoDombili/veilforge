import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('VF-SEC-001 hosting and CI consume only the commit-bound Mainnet production artifact', () => {
  const vercel = JSON.parse(read('vercel.json'));
  assert.equal(vercel.installCommand, 'npm ci --ignore-scripts');
  assert.equal(vercel.buildCommand, 'npm run build:arc-mainnet-production');
  assert.equal(vercel.outputDirectory, 'dist-mainnet-production');
  const build = read('scripts/build-web.mjs');
  const productionBuild = read('scripts/build-arc-mainnet-production.mjs');
  const provenance = read('scripts/lib/production-provenance.mjs');
  const verify = read('scripts/verify-arc-mainnet-production.mjs');
  const workflow = read('.github/workflows/v4-web-cross-browser-acceptance.yml');
  assert.match(build, /sourceCommit/u);
  assert.match(build, /isolated trusted Git snapshot/u);
  assert.match(build, /production-attestation\.json/u);
  assert.match(productionBuild, /buildProductionSnapshot/u);
  assert.match(provenance, /git', \['archive', '--format=tar'/u);
  assert.match(provenance, /'ci', '--ignore-scripts'/u);
  assert.match(provenance, /--porcelain=v1', '--untracked-files=all/u);
  assert.match(provenance, /--others', '--ignored', '--exclude-standard/u);
  assert.match(verify, /artifact byte attestation is invalid/u);
  assert.match(verify, /assertProductionArtifactProvenance/u);
  assert.match(verify, /assertProductionCheckout/u);
  assert.match(workflow, /build:arc-mainnet-production/u);
  assert.match(workflow, /verify:arc-mainnet-production/u);
  assert.match(workflow, /--artifact=dist-mainnet-production/u);
});

test('VF-SEC-005 production hosting applies CSP anti-framing and browser hardening headers', () => {
  const vercel = JSON.parse(read('vercel.json'));
  const headers = Object.fromEntries(vercel.headers[0].headers.map(({ key, value }) => [key, value]));
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/u);
  assert.match(headers['Content-Security-Policy'], /script-src 'self'/u);
  assert.doesNotMatch(headers['Content-Security-Policy'], /script-src[^;]*'unsafe-inline'/u);
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['Referrer-Policy'], 'no-referrer');
  assert.doesNotMatch(read('apps/web/index.html'), /<script>\s*[\s\S]*?<\/script>/u);
});

test('VF-SEC-006 documents unbounded contract strings as an accepted redeployment-bound residual risk', () => {
  const runbook = read('docs/security/arc-mainnet-migration-and-incident-runbook.md');
  assert.match(runbook, /unbounded-string issue is documented as an accepted residual risk/u);
  assert.match(runbook, /contract-level length limits would change deployed bytecode and requires a new deployment/u);
});

test('VF-SEC-007 documents immutable Registry incident handling and explicit migration', () => {
  const runbook = read('docs/security/arc-mainnet-migration-and-incident-runbook.md');
  assert.match(runbook, /no owner, pause switch, administrator, proxy, or upgrade path/u);
  assert.match(runbook, /do not repoint configuration silently/iu);
  assert.match(runbook, /new Registry is a new trust root/u);
});
