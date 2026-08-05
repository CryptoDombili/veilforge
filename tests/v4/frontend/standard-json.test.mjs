import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStandardJsonInput, normalizeSourceBundle, normalizeSourcePath, SourceNormalizationError,
} from '../../../packages/analyzer/src/v4/frontend/index.js';

test('Standard JSON contains deterministic normalized sources and required outputs', () => {
  const built = buildStandardJsonInput({
    sources: { 'src\\Z.sol': '\uFEFFpragma solidity 0.8.24;\r\n', './src/A.sol': 'pragma solidity 0.8.24;\r' },
    settings: {
      optimizer: { enabled: true, runs: 777 },
      evmVersion: 'shanghai',
      remappings: ['@lib/=lib/'],
      libraries: { 'src\\A.sol': { Linked: '0x0000000000000000000000000000000000000001' } },
    },
  });
  assert.deepEqual(Object.keys(built.input.sources), ['src/A.sol', 'src/Z.sol']);
  assert.equal(built.input.sources['src/Z.sol'].content, 'pragma solidity 0.8.24;\n');
  assert.deepEqual(built.input.settings.outputSelection['*'][''], ['ast']);
  assert.deepEqual(built.input.settings.outputSelection['*']['*'], [
    'abi', 'storageLayout', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.methodIdentifiers',
  ]);
  assert.deepEqual(built.input.settings.libraries, {
    'src/A.sol': { Linked: '0x0000000000000000000000000000000000000001' },
  });
  assert.equal(built.canonicalJson.includes('C:\\'), false);
});

test('path normalization is project-relative, NFC, slash-based, and strict', () => {
  assert.equal(normalizeSourcePath('.\\src\\Cafe\u0301.sol'), 'src/Caf\u00e9.sol');
  for (const sourcePath of ['/etc/A.sol', 'C:\\A.sol', '\\\\host\\A.sol', '../A.sol', 'src/../A.sol']) {
    assert.throws(() => normalizeSourcePath(sourcePath), SourceNormalizationError, sourcePath);
  }
});

test('exact and Windows case-folded normalized path collisions are rejected', () => {
  assert.throws(() => normalizeSourceBundle([
    { path: 'src/A.sol', content: 'a' },
    { path: 'src\\a.sol', content: 'b' },
  ]), (error) => error.code === 'source-path-collision');
});

test('source sorting uses code-point order independent of insertion order', () => {
  const first = buildStandardJsonInput({ sources: { 'z.sol': 'z', 'a.sol': 'a', '\ud83d\ude00.sol': 'u' } });
  const second = buildStandardJsonInput({ sources: { '\ud83d\ude00.sol': 'u', 'a.sol': 'a', 'z.sol': 'z' } });
  assert.equal(first.canonicalJson, second.canonicalJson);
  assert.deepEqual(Object.keys(first.input.sources), ['a.sol', 'z.sol', '\ud83d\ude00.sol']);
});
