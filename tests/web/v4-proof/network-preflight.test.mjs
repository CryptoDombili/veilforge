import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PUBLISH_REPORT_SELECTOR } from '../../../packages/proof/src/registry.js';
import { compileRegistryArtifact } from '../../../scripts/lib/registry-artifact.mjs';
import { ARC_MAINNET_REGISTRY_ADDRESS, ARC_MAINNET_REGISTRY_RUNTIME_DIGEST } from '../../../packages/proof/v4/network.js';
import { boundedReadOnlyRequest, invalidateNetworkPreflight, preflightArcTestnetProvider, preflightProofRegistryReads, REGISTRY_GET_LATEST_REPORT_SELECTOR, REGISTRY_HAS_REPORT_SELECTOR, REGISTRY_PUBLISHER_SCOPED_SELECTOR, REGISTRY_VERSION_SELECTOR } from '../../../apps/web/v4/proof-network-preflight.js';
import { readyProof } from './helpers.mjs';

const word = (value) => `0x${BigInt(value).toString(16).padStart(64, '0')}`;
const abiString = (value) => {
  const hex = Buffer.from(value, 'utf8').toString('hex');
  return `0x${BigInt(32).toString(16).padStart(64, '0')}${BigInt(hex.length / 2).toString(16).padStart(64, '0')}${hex.padEnd(Math.ceil(hex.length / 64) * 64, '0')}`;
};

function arcProvider(overrides = {}) {
  const calls = [];
  const provider = {
    calls,
    async request(request) {
      calls.push(structuredClone(request));
      const { method, params = [] } = request;
      if (overrides.errors?.[method]) throw overrides.errors[method];
      if (method === 'eth_chainId') return overrides.chainId ?? '0x4cef52';
      if (method === 'eth_getCode') return overrides.code ?? `0x6000${PUBLISH_REPORT_SELECTOR.slice(2)}6000`;
      if (method === 'eth_blockNumber') return overrides.blockNumber ?? '0x100';
      if (method === 'eth_estimateGas') {
        if (overrides.gasUnavailable) throw new Error('estimate unavailable with secret source');
        return overrides.gasEstimate ?? '0x1d4c0';
      }
      if (method === 'eth_call') {
        const data = String(params[0]?.data ?? '').toLowerCase();
        if (data.startsWith(REGISTRY_HAS_REPORT_SELECTOR.toLowerCase())) return word(overrides.duplicate ? 1 : 0);
        if (data.startsWith(REGISTRY_GET_LATEST_REPORT_SELECTOR.toLowerCase())) return overrides.latestRecordRaw ?? '0x';
        if (overrides.simulationFails) throw new Error('execution reverted: private/provider detail');
        return '0x';
      }
      throw new Error(`unsupported ${method}`);
    },
  };
  return provider;
}

async function run(provider = arcProvider()) {
  const proof = await readyProof();
  const result = await preflightArcTestnetProvider({ provider, envelope: proof.envelope, transactionRequest: proof.preflight.transactionRequest, payload: proof.preflight.payload, timeoutMs: 250 });
  return { ...proof, result, provider };
}

test('real provider absence fails closed without a transaction', async () => {
  const { result } = await run(null);
  assert.equal(result.passed, false); assert.deepEqual(result.blockingReasons, ['provider-chain-readable']);
});

test('correct Arc chain and trusted registry runtime pass read-only preflight', async () => {
  const { result, envelope } = await run();
  assert.equal(result.passed, true); assert.equal(result.chainId, 5_042_002); assert.equal(result.registryAddress, envelope.registryAddress);
});

test('verified Arc Mainnet Registry passes exact read-only runtime and getter preflight', async () => {
  const artifact = compileRegistryArtifact();
  const calls = [];
  const provider = { async request(request) {
    calls.push(structuredClone(request));
    if (request.method === 'eth_chainId') return '0x13b2';
    if (request.method === 'eth_getCode') return artifact.runtimeBytecode;
    if (request.method === 'eth_call') {
      const data = String(request.params?.[0]?.data ?? '').toLowerCase();
      if (data === REGISTRY_VERSION_SELECTOR.toLowerCase()) return abiString('2.0.0');
      if (data === REGISTRY_PUBLISHER_SCOPED_SELECTOR.toLowerCase()) return word(1);
    }
    throw new Error('unsupported read');
  } };
  const result = await preflightProofRegistryReads({ provider, networkKey: 'arc-mainnet', timeoutMs: 250 });
  assert.equal(result.passed, true);
  assert.equal(result.registryAddress, ARC_MAINNET_REGISTRY_ADDRESS);
  assert.equal(result.runtimeBytecodeDigest, ARC_MAINNET_REGISTRY_RUNTIME_DIGEST);
  assert.equal(result.registryVersion, '2.0.0');
  assert.equal(result.publisherScoped, true);
  assert.equal(result.explorerContractUrl, `https://explorer.arc.io/address/${ARC_MAINNET_REGISTRY_ADDRESS}`);
  assert.deepEqual([...new Set(calls.map((item) => item.method))].sort(), ['eth_call', 'eth_chainId', 'eth_getCode']);
  assert.equal(calls.some((item) => item.method.startsWith('eth_send')), false);
});

test('wrong chain fails before registry reads', async () => {
  const { result, provider } = await run(arcProvider({ chainId: '0x1' }));
  assert.equal(result.status, 'wrong-network'); assert.deepEqual(provider.calls.map((item) => item.method), ['eth_chainId']);
});

test('missing registry bytecode blocks preflight', async () => {
  const { result } = await run(arcProvider({ code: '0x' }));
  assert.equal(result.passed, false); assert.ok(result.blockingReasons.includes('registry-code-present'));
});

test('registry ABI selector mismatch blocks preflight', async () => {
  const { result } = await run(arcProvider({ code: '0x600060006000' }));
  assert.equal(result.passed, false); assert.ok(result.blockingReasons.includes('registry-selector-compatible'));
});

test('duplicate lookup is publisher scoped and included in state binding', async () => {
  const { result, provider } = await run(arcProvider({ duplicate: true, latestRecordRaw: '0x1234' }));
  assert.equal(result.duplicate, true); assert.ok(result.stateBindingDigest.startsWith('sha256:'));
  assert.ok(provider.calls.some((item) => item.method === 'eth_call' && item.params[0].data.startsWith(REGISTRY_HAS_REPORT_SELECTOR)));
});

test('gas estimate is honest when available', async () => {
  const { result } = await run();
  assert.equal(result.gasEstimateStatus, 'estimated'); assert.equal(result.gasEstimate, '0x1d4c0');
});

test('gas estimate failure does not invent a value', async () => {
  const { result } = await run(arcProvider({ gasUnavailable: true }));
  assert.equal(result.passed, true); assert.equal(result.gasEstimateStatus, 'unavailable'); assert.equal(result.gasEstimate, null);
});

test('publish simulation failure blocks readiness', async () => {
  const { result } = await run(arcProvider({ simulationFails: true }));
  assert.equal(result.passed, false); assert.ok(result.blockingReasons.includes('publish-simulation'));
});

test('preflight uses only bounded read-only provider methods', async () => {
  const { provider } = await run();
  assert.deepEqual([...new Set(provider.calls.map((item) => item.method))].sort(), ['eth_blockNumber', 'eth_call', 'eth_chainId', 'eth_estimateGas', 'eth_gasPrice', 'eth_getCode']);
  await assert.rejects(() => boundedReadOnlyRequest(provider, { method: 'eth_sendTransaction', params: [] }));
});

test('provider failures are mapped without raw provider details', async () => {
  await assert.rejects(() => boundedReadOnlyRequest(arcProvider({ errors: { eth_getCode: new Error('C:\\secret.sol provider internals') } }), { method: 'eth_getCode', params: [] }), (error) => error.code === 'WEB_V4_PROOF_PREFLIGHT_FAILED' && !/secret|provider internals/u.test(error.message));
});

test('same provider state produces deterministic binding and calldata digest', async () => {
  const left = (await run()).result; const right = (await run()).result;
  assert.equal(left.stateBindingDigest, right.stateBindingDigest); assert.equal(left.calldataDigest, right.calldataDigest);
});

test('registry record change changes binding and explicit invalidation is fail closed', async () => {
  const left = (await run(arcProvider({ latestRecordRaw: '0x01' }))).result;
  const right = (await run(arcProvider({ latestRecordRaw: '0x02' }))).result;
  assert.notEqual(left.stateBindingDigest, right.stateBindingDigest);
  assert.deepEqual(invalidateNetworkPreflight(left, 'registry-state-changed'), { status: 'invalidated', passed: false, reason: 'registry-state-changed', previousStateBindingDigest: left.stateBindingDigest });
});

test('real Arc smoke is fixed-endpoint and read-only', () => {
  const source = fs.readFileSync(new URL('../../../scripts/smoke-web-v4-proof-arc-readonly.mjs', import.meta.url), 'utf8');
  assert.match(source, /ARC_TESTNET\.rpcUrls\[0\]/u);
  assert.doesNotMatch(source, /eth_sendTransaction|eth_requestAccounts|wallet_switchEthereumChain|privateKey|seedPhrase/u);
});
