import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n?/gu, '\n');

test('reviewer release identities are explicit and compatibility-safe', async () => {
  const pkg = JSON.parse(read('package.json'));
  const version = await import('../apps/web/v4/version.js');
  const documents = [read('docs/RELEASE_STATUS.md'), read('SECURITY.md'), read('README.md')];
  assert.equal(pkg.version, '3.2.2');
  assert.equal(pkg.dependencies.solc, '0.8.24');
  assert.equal(pkg.overrides.tmp, '0.2.7');
  assert.equal(version.V4_PRODUCT_VERSION, '4.0.0-gc.1');
  assert.equal(version.V4_REPORT_VERSION, '4.1.0');
  for (const text of documents) {
    assert.match(text, /v4\.0\.0-gc\.2/u);
    assert.match(text, /4\.0\.0-gc\.1/u);
    assert.match(text, /4\.1\.0/u);
  }
  assert.doesNotMatch(documents[1], /actively validated release is `3\.2\.2`/u);
});

test('canonical grant build and verifier are explicit and fail closed', () => {
  const pkg = JSON.parse(read('package.json'));
  const build = read('scripts/build-grant-release.mjs');
  const verifier = read('scripts/verify-grant-release-artifact.mjs');
  assert.equal(pkg.scripts['build:grant-release'], 'node scripts/build-grant-release.mjs');
  assert.equal(pkg.scripts['verify:grant-release'], 'node scripts/verify-grant-release.mjs');
  assert.match(build, /manifest:check/u);
  assert.match(build, /VEILFORGE_WEB_V4_ENABLED = 'true'/u);
  assert.match(build, /dist-grant-release/u);
  for (const identity of ['4.0.0-gc.1', '4.1.0', 'veilforge.report.hash.v2']) assert.ok(verifier.includes(identity));
  assert.match(verifier, /ARC_MAINNET_UNRESOLVED/u);
});

test('checked-in dist is explicitly noncanonical and generated outputs stay excluded', () => {
  const marker = read('dist/README.md');
  assert.match(marker, /not the canonical V4 Grant Candidate reviewer artifact/u);
  assert.match(marker, /npm run build:grant-release/u);
  assert.match(read('.gitignore'), /dist-grant-release\//u);
  assert.match(read('scripts/release-manifest.mjs'), /'dist-grant-release'/u);
});

test('release browser policy executes the real supported matrix on V4 tags', () => {
  const workflow = read('.github/workflows/v4-web-cross-browser-acceptance.yml');
  for (const browser of ['chromium', 'firefox', 'webkit', 'edge']) assert.match(workflow, new RegExp(`browser: ${browser}`, 'u'));
  assert.match(workflow, /tags:\n\s+- 'v4\.\*'/u);

  assert.match(workflow, /npm run build:grant-release/u);
  assert.match(workflow, /node scripts\/smoke-web-v4-cross-browser\.mjs --browser=\$\{\{ matrix\.browser \}\}/u);
  assert.match(workflow, /browser: edge\n\s+os: windows-latest/u);
});

test('release manifest provenance is identity, not a forged verification assertion', () => {
  const build = read('scripts/build-web.mjs');
  assert.match(build, /releaseManifestMeaning: 'Digest identity/u);
  assert.doesNotMatch(build, /manifestVerified:\s*true/u);
  assert.match(read('docs/RELEASE_STATUS.md'), /does not prove that trusted CI verified/u);
});
