import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ARC_MAINNET_PREFLIGHT_CHAIN_ID,
  ARC_MAINNET_PREFLIGHT_CHAIN_ID_HEX,
  LOCAL_REHEARSAL_ADDRESS,
  assertArcMainnetPreflightChainId,
  assertMainnetRuntimeFailClosed,
  assertPreflightCreationRequest,
  buildPreflightCreationRequest,
  normalizePublicDeployerAddress,
  parsePreflightArgs,
  parseRpcQuantity,
  runArcMainnetPreflight,
  verifyPreflightArtifact,
} from '../../scripts/preflight-arc-mainnet-registry.mjs';
import {
  READ_ONLY_RPC_METHODS,
  assertReadOnlyRpcMethod,
  createReadOnlyRpcClient,
  sanitizeRpcUrl,
} from '../../scripts/lib/rpc-safety.mjs';
import { assertArtifactMatchesCandidate, buildArtifactTruth } from '../../scripts/lib/registry-artifact.mjs';
import { ARC_MAINNET_REGISTRY_ADDRESS, ARC_MAINNET_REGISTRY_DEPLOYMENT_BLOCK, ARC_MAINNET_REGISTRY_DEPLOYMENT_TX, ARC_MAINNET_REGISTRY_RUNTIME_DIGEST, ARC_TESTNET_REGISTRY_ADDRESS, PROOF_NETWORKS } from '../../packages/proof/v4/network.js';

const DEPLOYER = '0x1111111111111111111111111111111111111111';
const BLOCK_HASH = `0x${'ab'.repeat(32)}`;
const cleanGit = Object.freeze({ gitCommit: 'a'.repeat(40), dirty: false });
const dirtyGit = Object.freeze({ gitCommit: 'b'.repeat(40), dirty: true });

function rpcResponse(result) {
  return { ok: true, status: 200, async json() { return { jsonrpc: '2.0', id: 1, result }; } };
}

function createMockRpc(overrides = {}) {
  const calls = [];
  const values = {
    eth_chainId: '0x13b2',
    eth_blockNumber: '0x2a',
    eth_getBlockByNumber: { number: '0x2a', hash: BLOCK_HASH, timestamp: '0x66ed6d00', baseFeePerGas: '0x3b9aca00' },
    eth_gasPrice: '0x77359400',
    eth_getBalance: '0xde0b6b3a7640000',
    eth_estimateGas: '0x30d40',
    ...overrides,
  };
  return {
    calls,
    async fetch(_url, options) {
      const payload = JSON.parse(options.body);
      calls.push(payload);
      return rpcResponse(values[payload.method]);
    },
  };
}

const explorerFetch = async () => ({ ok: true, status: 200 });

test('read-only RPC allowlist rejects every send, signing, personal, and wallet method locally', async () => {
  assert.deepEqual(READ_ONLY_RPC_METHODS, ['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getBalance', 'eth_estimateGas', 'eth_gasPrice']);
  for (const method of READ_ONLY_RPC_METHODS) assert.equal(assertReadOnlyRpcMethod(method), method);
  for (const method of ['eth_sendTransaction', 'eth_sendRawTransaction', 'eth_sign', 'personal_sign', 'personal_unlockAccount', 'wallet_sendCalls', 'wallet_signTypedData']) {
    assert.throws(() => assertReadOnlyRpcMethod(method), (error) => error.code === 'READ_ONLY_RPC_METHOD_FORBIDDEN');
  }
  let fetchCalls = 0;
  const client = createReadOnlyRpcClient({ endpoint: 'https://rpc.example.invalid', fetchImpl: async () => { fetchCalls += 1; return rpcResponse(null); } });
  await assert.rejects(() => client.request('eth_sendRawTransaction', ['0xdead']), (error) => error.code === 'READ_ONLY_RPC_METHOD_FORBIDDEN');
  assert.equal(fetchCalls, 0);
  assert.equal(client.usage().forbiddenCallCount, 1);
});

test('chain identity gate accepts only exact canonical Arc Mainnet 0x13b2', () => {
  assert.equal(assertArcMainnetPreflightChainId(ARC_MAINNET_PREFLIGHT_CHAIN_ID_HEX), ARC_MAINNET_PREFLIGHT_CHAIN_ID);
  assert.throws(() => assertArcMainnetPreflightChainId('0x4cef52'), (error) => error.code === 'PREFLIGHT_TESTNET_CHAIN_REJECTED');
  assert.throws(() => assertArcMainnetPreflightChainId('5042002'), (error) => error.code === 'PREFLIGHT_TESTNET_CHAIN_REJECTED');
  for (const value of [5_042_002, '0x1', '0X13B2', '0x013b2', 5_042, null, undefined, 'malformed']) {
    assert.throws(() => assertArcMainnetPreflightChainId(value), /Arc (?:Testnet|Mainnet)/u);
  }
});

test('RPC quantities, public deployer address, and CLI surface are strict', () => {
  assert.equal(parseRpcQuantity('0x0', 'value'), 0n);
  assert.equal(parseRpcQuantity('0x2a', 'value'), 42n);
  for (const value of ['0x00', '0X2a', '42', '', null]) assert.throws(() => parseRpcQuantity(value, 'value'), (error) => error.code === 'PREFLIGHT_RPC_QUANTITY_INVALID');
  assert.equal(normalizePublicDeployerAddress(undefined), null);
  assert.equal(normalizePublicDeployerAddress(DEPLOYER), DEPLOYER);
  assert.throws(() => normalizePublicDeployerAddress(`0x${'00'.repeat(20)}`), (error) => error.code === 'PREFLIGHT_DEPLOYER_ADDRESS_INVALID');
  assert.deepEqual(parsePreflightArgs([]), { readOnly: true });
  assert.throws(() => parsePreflightArgs(['--rpc-url=https://secret.invalid']), (error) => error.code === 'PREFLIGHT_ARGUMENT_INVALID');
});

test('trusted production artifact matches and every digest drift fails closed', () => {
  const { artifact, candidate } = buildArtifactTruth();
  assert.equal(verifyPreflightArtifact(artifact, candidate).creationBytecodeDigest, artifact.creationBytecodeDigest);
  for (const field of ['creationBytecodeDigest', 'runtimeBytecodeDigest', 'abiDigest', 'sourceDigest']) {
    const drifted = { ...candidate, [field]: `sha256:${'00'.repeat(32)}` };
    assert.throws(() => assertArtifactMatchesCandidate(artifact, drifted), (error) => error.code === 'REGISTRY_ARTIFACT_MISMATCH' && error.field === field);
  }
});

test('gas-estimation request is exact zero-value contract creation with no arbitrary target or calldata', () => {
  const { artifact } = buildArtifactTruth();
  const request = buildPreflightCreationRequest(artifact, { from: DEPLOYER });
  assert.equal(Object.hasOwn(request, 'to'), false);
  assert.equal(request.from, DEPLOYER);
  assert.equal(request.value, '0x0');
  assert.equal(request.data, artifact.creationBytecode);
  assert.equal(assertPreflightCreationRequest(request, artifact, { deployer: DEPLOYER }), true);
  assert.throws(() => assertPreflightCreationRequest({ ...request, to: ARC_TESTNET_REGISTRY_ADDRESS }, artifact), (error) => error.code === 'PREFLIGHT_DEPLOYMENT_TARGET_INVALID');
  assert.throws(() => assertPreflightCreationRequest({ ...request, value: '0x1' }, artifact), (error) => error.code === 'PREFLIGHT_DEPLOYMENT_VALUE_NONZERO');
  assert.throws(() => assertPreflightCreationRequest({ ...request, data: '0xdead' }, artifact), (error) => error.code === 'PREFLIGHT_DEPLOYMENT_BYTECODE_MISMATCH');
});

test('preflight without public deployer uses only four network reads and leaves account fields unresolved', async () => {
  const rpc = createMockRpc();
  let output = '';
  const result = await runArcMainnetPreflight({ env: {}, fetchImpl: rpc.fetch, explorerFetchImpl: explorerFetch, git: dirtyGit, stdout: { write(value) { output += value; } } });
  assert.deepEqual(result.rpcMethods, ['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_gasPrice']);
  assert.equal(result.deployerAddress, 'UNRESOLVED');
  assert.equal(result.deployerBalance, 'UNRESOLVED');
  assert.match(result.gasEstimate, /public deployer address required/u);
  assert.match(result.estimatedDeploymentFee, /public deployer address/u);
  assert.equal(result.productionDeploymentReady, false);
  assert.equal(result.forbiddenRpcCallCount, 0);
  assert.equal(result.transactionCount, 0);
  assert.equal(result.walletSigningCount, 0);
  assert.doesNotMatch(output, /private.?key|seed.?phrase/iu);
});

test('public deployer enables read-only balance and exact-bytecode gas estimation', async () => {
  const rpc = createMockRpc();
  const result = await runArcMainnetPreflight({
    env: { VEILFORGE_DEPLOYER_ADDRESS: DEPLOYER }, fetchImpl: rpc.fetch, explorerFetchImpl: explorerFetch, git: cleanGit, stdout: { write() {} },
  });
  assert.equal(result.deployerAddress, DEPLOYER);
  assert.equal(result.deployerBalance.baseUnits, '1000000000000000000');
  assert.equal(result.gasEstimate, '200000');
  assert.equal(result.estimatedDeploymentFee.baseUnits, '400000000000000');
  assert.deepEqual(result.rpcMethods, ['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_gasPrice', 'eth_getBalance', 'eth_estimateGas']);
  const estimate = rpc.calls.find((call) => call.method === 'eth_estimateGas');
  const { artifact } = buildArtifactTruth();
  assert.deepEqual(estimate.params, [{ from: DEPLOYER, data: artifact.creationBytecode, value: '0x0' }]);
  assert.equal(result.productionDeploymentReady, true);
});

test('wrong chain aborts immediately before any other RPC or explorer call', async () => {
  for (const chainId of ['0x4cef52', '0x1', '0x013b2', 'malformed']) {
    const rpc = createMockRpc({ eth_chainId: chainId });
    let explorerCalls = 0;
    await assert.rejects(() => runArcMainnetPreflight({ env: {}, fetchImpl: rpc.fetch, explorerFetchImpl: async () => { explorerCalls += 1; return { ok: true, status: 200 }; }, git: cleanGit, stdout: { write() {} } }));
    assert.deepEqual(rpc.calls.map((call) => call.method), ['eth_chainId']);
    assert.equal(explorerCalls, 0);
  }
});

test('mainnet runtime remains verified production-safe and contains neither Testnet nor local Registry address', async () => {
  const before = JSON.stringify(PROOF_NETWORKS['arc-mainnet']);
  const state = assertMainnetRuntimeFailClosed();
  assert.deepEqual(state, {
    chainId: 5042,
    deploymentStatus: 'verified',
    enabled: true,
    proofReadEnabled: true,
    publishEnabled: true,
    registryAddress: ARC_MAINNET_REGISTRY_ADDRESS,
    registryDeploymentBlock: ARC_MAINNET_REGISTRY_DEPLOYMENT_BLOCK,
    registryDeploymentTransaction: ARC_MAINNET_REGISTRY_DEPLOYMENT_TX,
    registryRuntimeBytecodeDigest: ARC_MAINNET_REGISTRY_RUNTIME_DIGEST,
  });
  assert.notEqual(PROOF_NETWORKS['arc-mainnet'].registryAddress, ARC_TESTNET_REGISTRY_ADDRESS);
  assert.notEqual(PROOF_NETWORKS['arc-mainnet'].registryAddress, LOCAL_REHEARSAL_ADDRESS);
  const rpc = createMockRpc();
  await runArcMainnetPreflight({ env: {}, fetchImpl: rpc.fetch, explorerFetchImpl: explorerFetch, git: cleanGit, stdout: { write() {} } });
  assert.equal(JSON.stringify(PROOF_NETWORKS['arc-mainnet']), before);
});

test('RPC endpoint output is sanitized and preflight source has no signer or Wallet construction', () => {
  const sanitized = sanitizeRpcUrl('https://user:password@rpc.example.invalid/path?api_key=secret#token');
  assert.doesNotMatch(sanitized, /user|password|api_key=secret|#token/u);
  assert.match(sanitized, /REDACTED/u);
  const source = fs.readFileSync('scripts/preflight-arc-mainnet-registry.mjs', 'utf8');
  assert.doesNotMatch(source, /new\s+Wallet|new\s+JsonRpcProvider|sendTransaction|sendRawTransaction|signTransaction|signMessage/gu);
});
