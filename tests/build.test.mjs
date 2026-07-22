import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);

test('release uses a zero-dependency lockfile', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(packageJson.version, lock.packages[''].version);
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(packageJson.dependencies, undefined);
  assert.equal(packageJson.devDependencies, undefined);
});

test('web build contains canonical engine and proof modules', () => {
  for (const file of ['dist/index.html', 'dist/app.js', 'dist/engine/index.js', 'dist/proof/registry.js', 'dist/build-manifest.json']) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} is missing`);
  }
  const proof = fs.readFileSync(path.join(root, 'dist/proof/registry.js'), 'utf8');
  assert.match(proof, /\.\.\/engine\/keccak\.js/);
  assert.doesNotMatch(proof, /\.\.\/\.\.\/analyzer\/src/);
});
