import test from 'node:test';
import assert from 'node:assert/strict';
import { keccakHex } from '../packages/analyzer/src/index.js';
import {
  assertRpcChainId,
  implementationAddressFromStorage,
  normalizeRpcChainId,
  parseBytecodeArtifact,
  stripSolidityMetadata,
  verifyBytecodeTruth,
} from '../apps/web/lib/bytecode-truth.js';

const runtime = '0x6001600055';

test('Bytecode Truth parses a Hardhat compiler artifact', () => {
  const artifact = parseBytecodeArtifact({
    contractName: 'Payroll',
    sourceName: 'contracts/Payroll.sol',
    bytecode: '0x60606040',
    deployedBytecode: runtime,
    metadata: JSON.stringify({ compiler: { version: '0.8.24' }, settings: { optimizer: { enabled: true, runs: 200 } } }),
  }, 'Payroll.json');
  assert.equal(artifact.contractName, 'Payroll');
  assert.equal(artifact.sourceName, 'contracts/Payroll.sol');
  assert.equal(artifact.compilerVersion, '0.8.24');
  assert.deepEqual(artifact.optimizer, { enabled: true, runs: 200 });
  assert.equal(artifact.runtimeBytecode, runtime);
});

test('Bytecode Truth proves an exact deployed runtime match', () => {
  const artifact = parseBytecodeArtifact({ contractName: 'Payroll', deployedBytecode: runtime }, 'Payroll.json');
  const result = verifyBytecodeTruth({ artifact, targetBytecode: runtime, targetAddress: '0x1111111111111111111111111111111111111111', hash: keccakHex });
  assert.equal(result.status, 'ARC VERIFIED');
  assert.equal(result.verified, true);
  assert.equal(result.exact, true);
  assert.equal(result.matchedKind, 'target contract');
});

test('Bytecode Truth recognizes executable equivalence with different Solidity metadata', () => {
  const artifactRuntime = `${runtime}a1000002`;
  const deployedRuntime = `${runtime}b2000002`;
  assert.equal(stripSolidityMetadata(artifactRuntime), runtime);
  const artifact = parseBytecodeArtifact({ contractName: 'Payroll', deployedBytecode: artifactRuntime }, 'Payroll.json');
  const result = verifyBytecodeTruth({ artifact, targetBytecode: deployedRuntime, targetAddress: '0x2222222222222222222222222222222222222222', hash: keccakHex });
  assert.equal(result.status, 'STRUCTURAL MATCH');
  assert.equal(result.verified, true);
  assert.equal(result.exact, false);
});

test('Bytecode Truth follows an ERC-1967 implementation slot', () => {
  const implementation = '0x3333333333333333333333333333333333333333';
  const storageWord = `0x${'0'.repeat(24)}${implementation.slice(2)}`;
  assert.equal(implementationAddressFromStorage(storageWord), implementation);
  const artifact = parseBytecodeArtifact({ contractName: 'Payroll', deployedBytecode: runtime }, 'Payroll.json');
  const result = verifyBytecodeTruth({
    artifact,
    targetBytecode: '0x60006000',
    implementationBytecode: runtime,
    targetAddress: '0x4444444444444444444444444444444444444444',
    implementationAddress: implementation,
    hash: keccakHex,
  });
  assert.equal(result.status, 'ARC VERIFIED');
  assert.equal(result.matchedAddress, implementation);
  assert.equal(result.matchedKind, 'proxy implementation');
});

test('Bytecode Truth rejects a mismatched Arc runtime', () => {
  const artifact = parseBytecodeArtifact({ contractName: 'Payroll', deployedBytecode: runtime }, 'Payroll.json');
  const result = verifyBytecodeTruth({ artifact, targetBytecode: '0x6002600055', targetAddress: '0x5555555555555555555555555555555555555555', hash: keccakHex });
  assert.equal(result.status, 'MISMATCH');
  assert.equal(result.verified, false);
});


test('Bytecode Truth normalizes JSON-RPC chain IDs', () => {
  assert.equal(normalizeRpcChainId('0x4CEF52'), '0x4cef52');
  assert.equal(normalizeRpcChainId('5042002'), '0x4cef52');
  assert.equal(normalizeRpcChainId(5_042_002), '0x4cef52');
  assert.equal(normalizeRpcChainId('not-a-chain'), null);
});

test('Bytecode Truth blocks non-Arc RPCs before bytecode verification', () => {
  assert.equal(assertRpcChainId('0x4CEF52', '0x4cef52', 'Arc Testnet chain 5042002'), '0x4cef52');
  assert.throws(
    () => assertRpcChainId('0x1', '0x4cef52', 'Arc Testnet chain 5042002'),
    /RPC network mismatch: expected Arc Testnet chain 5042002 \(0x4cef52\), received 0x1\. Verification stopped before reading bytecode\./,
  );
  assert.throws(() => assertRpcChainId('invalid', '0x4cef52'), /invalid chain ID/);
});
