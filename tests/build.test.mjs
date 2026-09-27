import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

test('release lockfile permits only exact compiler, local EVM tooling, and smoke client versions', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(packageJson.version, lock.packages[''].version);
  assert.equal(lock.lockfileVersion, 3);
  assert.deepEqual(packageJson.dependencies, { solc: '0.8.24' });
  assert.deepEqual(lock.packages[''].dependencies, { solc: '0.8.24' });
  assert.equal(lock.packages['node_modules/solc'].version, '0.8.24');
  const expectedDevDependencies = {
    '@ethereumjs/block': '10.1.3', '@ethereumjs/common': '10.1.3', '@ethereumjs/tx': '10.1.3', '@ethereumjs/util': '10.1.3', '@ethereumjs/vm': '10.1.3',
    ethers: '6.17.0', ws: '8.21.3',
  };
  assert.deepEqual(packageJson.devDependencies, expectedDevDependencies);
  assert.deepEqual(lock.packages[''].devDependencies, expectedDevDependencies);
  assert.equal(lock.packages['node_modules/ethers'].version, '6.17.0');
  for (const name of ['block', 'common', 'tx', 'util', 'vm']) assert.equal(lock.packages[`node_modules/@ethereumjs/${name}`].version, '10.1.3');
  assert.equal(lock.packages['node_modules/ws'].version, '8.21.3');
  assert.equal(lock.packages['node_modules/ws'].dev, true);
});

test('web build contains canonical engine and proof modules', () => {
  for (const file of ['dist/index.html', 'dist/app/index.html', 'dist/landing.css', 'dist/landing-rain.js', 'dist/app.js', 'dist/engine/index.js', 'dist/proof/registry.js', 'dist/build-manifest.json']) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} is missing`);
  }
  const proof = fs.readFileSync(path.join(root, 'dist/proof/registry.js'), 'utf8');
  assert.match(proof, /\.\.\/engine\/keccak\.js/);
  assert.doesNotMatch(proof, /\.\.\/\.\.\/analyzer\/src/);
});

test('built UI artifact cannot leak a hardcoded Testnet badge into Mainnet builds', () => {
  const ui = fs.readFileSync(path.join(root, 'dist/v4/ui.js'), 'utf8');
  assert.doesNotMatch(ui, /<span class="v4-context-pill">ARC TESTNET<\/span>/u);
  assert.doesNotMatch(ui, /<span class="v4-context-pill">ARC MAINNET<\/span>/u);
  assert.match(ui, /proofNetworkContextLabel\(configuredProofNetwork\)/u);
});

test('pre-runtime network placeholders are neutral and runtime-owned', () => {
  for (const file of ['apps/web/app/index.html', 'dist/app/index.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /data-active-network-name>Arc network<\/span>/u);
    assert.match(html, /data-active-chain-id>—<\/span>/u);
    assert.doesNotMatch(html, /data-active-network-name>Arc Testnet<\/span>|data-active-chain-id>5042002<\/span>|Arc Network Testnet/u);
  }
});


test('release does not load the legacy global brand override', () => {
  for (const file of ['dist/index.html', 'dist/app/index.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(html, /brand-lock\.css/i, `${file} still loads brand-lock.css`);
  }
  const legacyPath = path.join(root, 'dist/brand-lock.css');
  if (fs.existsSync(legacyPath)) {
    const legacyCss = fs.readFileSync(legacyPath, 'utf8').trim();
    assert.match(legacyCss, /^\/\* Disabled: obsolete visual override/);
    assert.doesNotMatch(legacyCss, /\{[^}]*\}/, 'legacy brand-lock.css contains active CSS rules');
  }
});
