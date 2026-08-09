import assert from 'node:assert/strict';
import test from 'node:test';
import { browserFilesToScanInput } from '../../../apps/web/v4/input-adapter.js';
import { compileProject } from '../../../packages/analyzer/src/v4/frontend/index.js';

function file(path, content) {
  return { name: path.split('/').at(-1), webkitRelativePath: path, size: new TextEncoder().encode(content).byteLength, async text() { return content; } };
}
const pragma = 'pragma solidity 0.8.24; ';
const options = { projectId: 'browser-resolver', compilerVersion: '0.8.24' };

test('browser folder resolves provided project-local package files without network access', async () => {
  const input = await browserFilesToScanInput([
    file('demo/contracts/Vault.sol', `${pragma}import "@openzeppelin/contracts/access/Ownable.sol"; contract Vault is Ownable {}`),
    file('demo/node_modules/@openzeppelin/contracts/access/Ownable.sol', `${pragma}abstract contract Ownable {}`),
  ], options);
  assert.deepEqual(Object.keys(input.sources), ['@openzeppelin/contracts/access/Ownable.sol', 'contracts/Vault.sol']);
  assert.equal(input.resolution.provenance[0].origin, 'node_modules');
  assert.equal(compileProject({ sources: input.sources, settings: input.settings }).result.status, 'compiled');
});

test('browser folder consumes an explicitly provided remappings.txt and Foundry lib', async () => {
  const input = await browserFilesToScanInput([
    file('demo/src/Vault.sol', `${pragma}import "@oz/Ownable.sol"; contract Vault is Ownable {}`),
    file('demo/lib/openzeppelin/Ownable.sol', `${pragma}abstract contract Ownable {}`),
    file('demo/remappings.txt', '@oz/=lib/openzeppelin/\n'),
  ], options);
  assert.equal(input.settings.remappings[0], '@oz/=lib/openzeppelin/');
  assert.equal(compileProject({ sources: input.sources, settings: input.settings }).result.status, 'compiled');
});

test('browser folder fails closed when a package dependency was not provided', async () => {
  await assert.rejects(browserFilesToScanInput([
    file('demo/contracts/Vault.sol', `${pragma}import "missing/Nope.sol"; contract Vault {}`),
  ], options), (error) => error.code === 'WEB_V4_IMPORT_RESOLUTION_FAILED' && error.safeDetails.reason === 'MISSING_IMPORT');
});

test('browser package imports never fall back to nested node_modules suffixes', async () => {
  const entry = file('demo/src/A.sol', `${pragma}import "pkg/B.sol"; contract A is B {}`);
  const root = file('demo/node_modules/pkg/B.sol', `${pragma}contract B { function source() external pure returns(uint){ return 1; } }`);
  const nested = file('demo/vendor/node_modules/pkg/B.sol', `${pragma}contract B { function source() external pure returns(uint){ return 2; } }`);
  const nestedTwo = file('demo/other/node_modules/pkg/B.sol', `${pragma}contract B {}`);
  const missing = (files) => assert.rejects(browserFilesToScanInput(files, options),
    (error) => error.code === 'WEB_V4_IMPORT_RESOLUTION_FAILED' && error.safeDetails.reason === 'MISSING_IMPORT');

  await missing([entry]);
  const rootOnly = await browserFilesToScanInput([entry, root], options);
  assert.equal(rootOnly.sources['pkg/B.sol'].content.includes('return 1'), true);
  await missing([entry, nested]);
  await missing([entry, nested, nestedTwo]);
  const rootWins = await browserFilesToScanInput([entry, root, nested], options);
  assert.equal(rootWins.sources['pkg/B.sol'].content.includes('return 1'), true);
  assert.equal(rootWins.sources['pkg/B.sol'].content.includes('return 2'), false);
});

test('browser rejects unsupported contextual remapping before considering any fallback source', async () => {
  const entry = file('demo/src/A.sol', `${pragma}import "@oz/B.sol"; contract A is B {}`);
  const remapping = file('demo/remappings.txt', 'src/:@oz/=lib/intended/\n');
  const variants = [
    [],
    [file('demo/lib/intended/B.sol', `${pragma}contract B {}`)],
    [file('demo/node_modules/@oz/B.sol', `${pragma}contract B {}`)],
    [file('demo/lib/intended/B.sol', `${pragma}contract B {}`), file('demo/node_modules/@oz/B.sol', `${pragma}contract B {}`)],
  ];
  for (const candidates of variants) {
    await assert.rejects(browserFilesToScanInput([entry, remapping, ...candidates], options),
      (error) => error.code === 'WEB_V4_IMPORT_RESOLUTION_FAILED' && error.safeDetails.reason === 'INVALID_REMAPPING');
  }
});

test('browser folder normalization is root-name independent and rejects mixed roots', async () => {
  const source = `${pragma}import "@oz/B.sol"; contract A is B {}`;
  const dependency = `${pragma}contract B {}`;
  const resolved = [];
  for (const root of ['demo', 'project', 'foo-bar']) {
    resolved.push(await browserFilesToScanInput([
      file(`${root}/contracts/A.sol`, source),
      file(`${root}/node_modules/@oz/B.sol`, dependency),
    ], options));
  }
  for (const input of resolved.slice(1)) {
    assert.deepEqual(input.sources, resolved[0].sources);
    assert.deepEqual(input.settings, resolved[0].settings);
    assert.equal(compileProject({ sources: input.sources, settings: input.settings }).result.canonicalSourceHash,
      compileProject({ sources: resolved[0].sources, settings: resolved[0].settings }).result.canonicalSourceHash);
  }
  await assert.rejects(browserFilesToScanInput([
    file('demo/contracts/A.sol', source), file('other/node_modules/@oz/B.sol', dependency),
  ], options), (error) => error.code === 'WEB_V4_INPUT_INVALID');
});
