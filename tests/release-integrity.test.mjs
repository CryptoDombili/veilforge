import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('release manifest is independent of normal-clone and linked-worktree git metadata', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'veilforge-manifest-'));
  try {
    fs.writeFileSync(path.join(fixture, '.git'), 'gitdir: C:/temporary/worktree\n');
    fs.mkdirSync(path.join(fixture, 'assets', 'v4'), { recursive: true });
    fs.writeFileSync(path.join(fixture, 'README.md'), '# Fixture\r\n');
    fs.writeFileSync(path.join(fixture, 'assets', 'v4', 'scanner.png'), Buffer.from([0, 1, 2, 3]));
    fs.mkdirSync(path.join(fixture, 'dist'));
    fs.writeFileSync(path.join(fixture, 'dist', 'generated.js'), 'ignored\n');
    fs.writeFileSync(path.join(fixture, 'archive.zip'), 'ignored');

    const script = path.join(root, 'scripts', 'release-manifest.mjs');
    const write = spawnSync(process.execPath, [script, '--write'], { cwd: fixture, encoding: 'utf8' });
    assert.equal(write.status, 0, write.stderr);
    const manifestPath = path.join(fixture, 'RELEASE_MANIFEST.sha256');
    const manifest = fs.readFileSync(manifestPath, 'utf8');
    assert.match(manifest, /  README\.md$/mu);
    assert.match(manifest, /  assets\/v4\/scanner\.png$/mu);
    assert.doesNotMatch(manifest, /  \.git$/mu);
    assert.doesNotMatch(manifest, /RELEASE_MANIFEST\.sha256|dist\/generated|archive\.zip/u);

    const before = fs.statSync(manifestPath).mtimeMs;
    const check = spawnSync(process.execPath, [script, '--check'], { cwd: fixture, encoding: 'utf8' });
    assert.equal(check.status, 0, check.stderr);
    assert.equal(fs.statSync(manifestPath).mtimeMs, before);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('current V4 reviewer identity is distinct from the legacy root compatibility version', async () => {
  const versions = await import('../apps/web/v4/version.js');
  const rootPackage = JSON.parse(read('package.json'));
  const build = read('scripts/build-web.mjs');
  const ui = read('apps/web/v4/ui.js');
  const readme = read('README.md');

  assert.equal(rootPackage.version, '3.2.2');
  assert.equal(versions.V4_PRODUCT_NAME, 'VeilForge V4 Grant Candidate');
  assert.equal(versions.V4_PRODUCT_VERSION, '4.0.0-gc.1');
  assert.equal(versions.V4_REPORT_VERSION, '4.1.0');
  assert.match(build, /webV4Enabled \? V4_PRODUCT_VERSION : '3\.2\.2'/u);
  assert.match(build, /reportSchemaVersion: V4_REPORT_VERSION/u);
  assert.match(ui, /REPORT \$\{V4_REPORT_VERSION\}/u);
  assert.match(readme, /root npm package remains at `3\.2\.2`/u);
});
