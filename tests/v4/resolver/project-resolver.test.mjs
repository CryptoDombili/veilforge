import assert from 'node:assert/strict';
import test from 'node:test';
import { compileProject, resolveVirtualProject } from '../../../packages/analyzer/src/v4/frontend/index.js';

const pragma = 'pragma solidity 0.8.24; ';
const content = (body) => `${pragma}${body}`;

test('Hardhat package imports and transitive package relatives resolve from canonical virtual paths', () => {
  const resolved = resolveVirtualProject({ sources: {
    'contracts/Vault.sol': content('import "@openzeppelin/contracts/access/Ownable.sol"; contract Vault is Ownable {}'),
    'node_modules/@openzeppelin/contracts/access/Ownable.sol': content('import "../utils/Context.sol"; abstract contract Ownable is Context {}'),
    'node_modules/@openzeppelin/contracts/utils/Context.sol': content('abstract contract Context {}'),
  } });
  assert.deepEqual(Object.keys(resolved.sources), ['@openzeppelin/contracts/access/Ownable.sol', '@openzeppelin/contracts/utils/Context.sol', 'contracts/Vault.sol']);
  assert.equal(resolved.provenance.find((item) => item.path.startsWith('@openzeppelin/')).origin, 'node_modules');
  assert.equal(compileProject({ sources: resolved.sources, settings: resolved.settings, resolverSources: resolved.resolverSources }).result.status, 'compiled');
});

test('Foundry lib remappings use longest deterministic prefix and compile', () => {
  const resolved = resolveVirtualProject({
    sources: {
      'src/Vault.sol': content('import "@oz/access/Ownable.sol"; import "foo/Math.sol"; contract Vault is Ownable { function f(uint x) external pure returns(uint){return Math.twice(x);} }'),
      'lib/openzeppelin/access/Ownable.sol': content('abstract contract Ownable {}'),
      'lib/foo/src/Math.sol': content('library Math { function twice(uint x) internal pure returns(uint){return x*2;} }'),
    },
    settings: { remappings: ['@oz/=lib/openzeppelin/', 'foo/=lib/foo/src/'] },
  });
  assert.equal(compileProject({ sources: resolved.sources, settings: resolved.settings }).result.status, 'compiled');
  assert.equal(resolved.provenance.filter((item) => item.origin === 'foundry-remapping').length, 2);
});

test('nested relatives, transitive dependencies, cycles, and enumeration order are deterministic', () => {
  const forward = {
    'src/A.sol': content('import "./lib/B.sol"; contract A {}'),
    'src/lib/B.sol': content('import "./nested/C.sol"; import "../A.sol"; contract B {}'),
    'src/lib/nested/C.sol': content('contract C {}'),
  };
  const reverse = Object.fromEntries(Object.entries(forward).reverse());
  const a = resolveVirtualProject({ sources: forward });
  const b = resolveVirtualProject({ sources: reverse });
  assert.deepEqual(a.sources, b.sources);
  assert.deepEqual(a.provenance, b.provenance);
  assert.equal(compileProject({ sources: a.sources }).result.status, 'compiled');
});

test('missing, network, absolute, traversal, mixed traversal, and encoded paths fail closed', () => {
  const cases = [
    ['MISSING_IMPORT', './Missing.sol'],
    ['UNSUPPORTED_IMPORT_SCHEME', 'https://example.invalid/A.sol'],
    ['UNSUPPORTED_IMPORT_SCHEME', 'ipfs://cid/A.sol'],
    ['PATH_ESCAPE', '/etc/secret.sol'],
    ['PATH_ESCAPE', 'C:\\secret.sol'],
    ['PATH_ESCAPE', '\\\\server\\share\\secret.sol'],
    ['PATH_ESCAPE', '../../secret.sol'],
    ['PATH_ESCAPE', '..\\..\\secret.sol'],
    ['PATH_ESCAPE', '%2e%2e%2fsecret.sol'],
    ['PATH_ESCAPE', 'pkg/Secret.sol:stream'],
    ['PATH_ESCAPE', 'pkg/NUL.sol'],
    ['PATH_ESCAPE', 'pkg/Secret.sol.'],
  ];
  for (const [code, specifier] of cases) {
    assert.throws(() => resolveVirtualProject({ sources: { 'src/A.sol': content(`import "${specifier}"; contract A {}`) } }), { code });
  }
});

test('malicious, conflicting, oversized, and excessive remappings fail closed', () => {
  const base = { sources: { 'src/A.sol': content('contract A {}') } };
  assert.throws(() => resolveVirtualProject({ ...base, settings: { remappings: ['evil/=../../outside/'] } }), { code: 'INVALID_REMAPPING' });
  assert.throws(() => resolveVirtualProject({ ...base, settings: { remappings: ['x/=lib/x/', 'x/=lib/y/'] } }), { code: 'INVALID_REMAPPING' });
  assert.throws(() => resolveVirtualProject({ ...base, settings: { remappings: ['x/=lib/x/'] }, limits: { maxRemappingBytes: 3 } }), { code: 'LIMIT_EXCEEDED' });
  assert.throws(() => resolveVirtualProject({ ...base, settings: { remappings: ['x/=lib/x/'] }, limits: { maxRemappingCount: 0 } }), { code: 'LIMIT_EXCEEDED' });
  assert.throws(() => resolveVirtualProject({ ...base, limits: { maxFileCount: 2048 } }), { code: 'LIMIT_EXCEEDED' });
});

test('unsupported context-qualified remappings fail before any fallback candidate is selected', () => {
  const entry = { 'src/A.sol': content('import "@oz/B.sol"; contract A is B {}') };
  const candidates = [
    {},
    { 'lib/intended/B.sol': content('contract B {}') },
    { 'node_modules/@oz/B.sol': content('contract B {}') },
    { 'lib/intended/B.sol': content('contract B {}'), 'node_modules/@oz/B.sol': content('contract B {}') },
  ];
  for (const candidate of candidates) {
    assert.throws(() => resolveVirtualProject({
      sources: { ...entry, ...candidate },
      settings: { remappings: ['src/:@oz/=lib/intended/'] },
    }), { code: 'INVALID_REMAPPING' });
  }
});

test('package imports use only the canonical root-local node_modules path', () => {
  const entry = { 'src/A.sol': content('import "pkg/B.sol"; contract A is B {}') };
  const shadow = content('contract B { function source() external pure returns(uint){ return 111; } }');
  const packageSource = content('contract B { function source() external pure returns(uint){ return 222; } }');
  assert.throws(() => resolveVirtualProject({ sources: entry }), { code: 'MISSING_IMPORT' });
  assert.throws(() => resolveVirtualProject({ sources: { ...entry, 'pkg/B.sol': shadow } }), { code: 'MISSING_IMPORT' });

  const root = resolveVirtualProject({ sources: {
    ...entry,
    'node_modules/pkg/B.sol': packageSource,
  } });
  assert.equal(root.sources['pkg/B.sol'].content.includes('return 222'), true);
  assert.equal(compileProject({ sources: root.sources, resolverSources: root.resolverSources }).result.status, 'compiled');

  const packageBeatsRootShadow = resolveVirtualProject({ sources: {
    ...entry,
    'pkg/B.sol': shadow,
    'node_modules/pkg/B.sol': packageSource,
  } });
  assert.equal(packageBeatsRootShadow.sources['pkg/B.sol'].content.includes('return 222'), true);
  assert.equal(packageBeatsRootShadow.sources['pkg/B.sol'].content.includes('return 111'), false);

  assert.throws(() => resolveVirtualProject({ sources: {
    ...entry,
    'vendor/node_modules/pkg/B.sol': content('contract B {}'),
  } }), { code: 'MISSING_IMPORT' });
  assert.throws(() => resolveVirtualProject({ sources: {
    ...entry,
    'one/node_modules/pkg/B.sol': content('contract B {}'),
    'two/node_modules/pkg/B.sol': content('contract B {}'),
  } }), { code: 'MISSING_IMPORT' });

  const rootWins = resolveVirtualProject({ sources: {
    ...entry,
    'node_modules/pkg/B.sol': packageSource,
    'vendor/node_modules/pkg/B.sol': shadow,
  } });
  assert.equal(rootWins.sources['pkg/B.sol'].content.includes('return 222'), true);
  assert.equal(rootWins.sources['pkg/B.sol'].content.includes('return 111'), false);

  const relative = resolveVirtualProject({
    sources: {
      'src/A.sol': content('import "../pkg/B.sol"; contract A is B {}'),
      'pkg/B.sol': shadow,
    },
    entrypoints: ['src/A.sol'],
  });
  assert.equal(relative.sources['pkg/B.sol'].content.includes('return 111'), true);
  assert.equal(compileProject({ sources: relative.sources }).result.status, 'compiled');
});

test('canonical collisions fail closed', () => {
  assert.throws(() => resolveVirtualProject({ sources: [
    { path: 'src/A.sol', content: content('contract A {}') },
    { path: 'src/a.sol', content: content('contract B {}') },
  ] }), { code: 'AMBIGUOUS_IMPORT' });
  assert.throws(() => resolveVirtualProject({ sources: {
    'src/A.sol': content('import "pkg/A.sol"; import "node_modules/pkg/A.sol"; contract A {}'),
    'node_modules/pkg/A.sol': content('contract PackageA {}'),
  } }), { code: 'AMBIGUOUS_IMPORT' });
});

test('file, byte, depth, and specifier resource limits are deterministic', () => {
  const pair = { 'src/A.sol': content('import "./B.sol"; contract A {}'), 'src/B.sol': content('contract B {}') };
  assert.throws(() => resolveVirtualProject({ sources: pair, limits: { maxFileCount: 1 } }), { code: 'LIMIT_EXCEEDED' });
  assert.throws(() => resolveVirtualProject({ sources: pair, limits: { maxProjectBytes: 10 } }), { code: 'LIMIT_EXCEEDED' });
  assert.throws(() => resolveVirtualProject({ sources: pair, limits: { maxPerFileBytes: 10 } }), { code: 'LIMIT_EXCEEDED' });
  assert.throws(() => resolveVirtualProject({ sources: {
    'src/A.sol': content('import "./B.sol"; contract A {}'),
    'src/B.sol': content('import "./C.sol"; contract B {}'),
    'src/C.sol': content('contract C {}'),
  }, limits: { maxImportDepth: 1 } }), { code: 'LIMIT_EXCEEDED' });
  assert.throws(() => resolveVirtualProject({ sources: { 'src/A.sol': content(`import "${'a'.repeat(20)}"; contract A {}`) }, limits: { maxImportSpecifierBytes: 8 } }), { code: 'LIMIT_EXCEEDED' });
});

test('provenance is bounded to canonical paths and contains no host path', () => {
  const result = resolveVirtualProject({ sources: { 'src/A.sol': content('contract A {}') } });
  assert.deepEqual(result.provenance, [{ path: 'src/A.sol', origin: 'project' }]);
  assert.equal(JSON.stringify(result.provenance).includes('C:\\'), false);
  assert.equal(JSON.stringify(result.provenance).includes('/home/'), false);
});
