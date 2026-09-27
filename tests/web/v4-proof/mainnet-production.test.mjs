import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { encodePublishReport } from '../../../packages/proof/src/registry.js';
import {
  ARC_MAINNET_REGISTRY_ADDRESS,
  ARC_MAINNET_SMOKE_PROJECT_ID,
  ARC_MAINNET_SMOKE_REPORT_HASH,
  ARC_TESTNET_REGISTRY_ADDRESS,
} from '../../../packages/proof/v4/network.js';
import {
  ARC_MAINNET_PRODUCTION,
  assertMainnetTransactionRequest,
  mainnetPublishingRollbackConfig,
  validateMainnetReadinessConfig,
} from '../../../packages/proof/v4/mainnet-readiness.js';
import { safeTransactionRequest } from '../../../apps/web/v4/proof-adapter.js';
import { preflightProofNetworkProvider, REGISTRY_GET_LATEST_REPORT_SELECTOR, REGISTRY_HAS_REPORT_SELECTOR } from '../../../apps/web/v4/proof-network-preflight.js';
import { assertTrustedProofSend, createUserGatedProofReview } from '../../../apps/web/v4/proof-send-boundary.js';
import { submitUserApprovedProofTransaction } from '../../../apps/web/v4/proof-transaction-acceptance.js';
import { buildArtifactTruth } from '../../../scripts/lib/registry-artifact.mjs';
import { ACCOUNT, TX_HASH, readyProof, testProofSendCoordinator } from './helpers.mjs';

const click = Object.freeze({ type: 'click', isTrusted: true });
const payload = Object.freeze({
  projectId: `0x${'01'.repeat(32)}`,
  sourceHash: `0x${'02'.repeat(32)}`,
  reportHash: `0x${'03'.repeat(32)}`,
  score: 0,
  scannerVersion: '4.0.0-gc.1|production-regression',
  reportURI: 'veilforge://production-regression',
});
const data = encodePublishReport(payload);
const request = Object.freeze({ from: ACCOUNT, to: ARC_MAINNET_REGISTRY_ADDRESS, chainId: '0x13b2', data, value: '0x0' });

function expectBlocked(overrides, options = {}) {
  assert.throws(() => assertTrustedProofSend({
    networkKey: 'arc-mainnet',
    providerChainId: 5_042,
    registryAddress: ARC_MAINNET_REGISTRY_ADDRESS,
    transactionRequest: request,
    userApproved: true,
    ...options,
    ...overrides,
  }));
}

test('valid canonical Mainnet publication with explicit approval can pass the lower-level boundary', () => {
  const network = assertTrustedProofSend({ networkKey: 'arc-mainnet', providerChainId: 5_042, registryAddress: ARC_MAINNET_REGISTRY_ADDRESS, transactionRequest: request, userApproved: true });
  assert.equal(network.networkKey, 'arc-mainnet');
});

test('Mainnet lower-level boundary blocks missing approval and every transaction identity drift', () => {
  expectBlocked({ userApproved: false });
  expectBlocked({ providerChainId: 1 });
  expectBlocked({ registryAddress: ARC_TESTNET_REGISTRY_ADDRESS });
  expectBlocked({ transactionRequest: { ...request, to: ARC_TESTNET_REGISTRY_ADDRESS } });
  expectBlocked({ transactionRequest: { ...request, data: `0x12345678${data.slice(10)}` } });
  expectBlocked({ transactionRequest: { ...request, value: '0x1' } });
  expectBlocked({ transactionRequest: { ...request, data: '0x6133eb3a00' } });
  expectBlocked({ registryAddress: ARC_TESTNET_REGISTRY_ADDRESS, transactionRequest: { ...request, to: ARC_TESTNET_REGISTRY_ADDRESS } });
});

test('unverified deployment configuration cannot authorize Mainnet publishing', () => {
  assert.throws(() => validateMainnetReadinessConfig({ ...ARC_MAINNET_PRODUCTION, deploymentStatus: 'deployed-unverified' }, { requirePublish: true }), (error) => error.code === 'MAINNET_CONFIG_UNVERIFIED');
});

test('known first-publication smoke fixture is hard-blocked before provider access', () => {
  const smokeData = encodePublishReport({ ...payload, projectId: ARC_MAINNET_SMOKE_PROJECT_ID, reportHash: ARC_MAINNET_SMOKE_REPORT_HASH });
  assert.throws(() => safeTransactionRequest({ ...request, data: smokeData }, 'arc-mainnet'), (error) => error.code === 'WEB_V4_PROOF_DUPLICATE');
});

test('publishing rollback blocks before eth_sendTransaction while preserving verified reads', () => {
  const calls = [];
  const provider = { async request(value) { calls.push(value); return TX_HASH; } };
  const rollback = mainnetPublishingRollbackConfig();
  assert.equal(rollback.enabled, true);
  assert.equal(rollback.proofReadEnabled, true);
  assert.equal(rollback.publishEnabled, false);
  assert.throws(() => assertMainnetTransactionRequest(request, rollback), (error) => error.code === 'MAINNET_PUBLISH_DISABLED');
  assert.deepEqual(calls, []);
  assert.equal(provider.request instanceof Function, true);
});

test('Mainnet wallet path revalidates live state and issues exactly one manual wallet request with no retry', async () => {
  const proof = await readyProof({ networkKey: 'arc-mainnet' });
  const { artifact } = buildArtifactTruth();
  const calls = [];
  const provider = {
    async request(value) {
      calls.push(structuredClone(value));
      const { method, params = [] } = value;
      if (method === 'eth_accounts') return [ACCOUNT];
      if (method === 'eth_chainId') return '0x13b2';
      if (method === 'eth_getCode') return artifact.runtimeBytecode;
      if (method === 'eth_blockNumber') return '0x100';
      if (method === 'eth_estimateGas') return '0x1d4c0';
      if (method === 'eth_gasPrice') return '0x4e3b29200';
      if (method === 'eth_call') {
        const callData = String(params[0]?.data ?? '').toLowerCase();
        if (callData.startsWith(REGISTRY_HAS_REPORT_SELECTOR.toLowerCase())) return `0x${'0'.repeat(64)}`;
        if (callData.startsWith(REGISTRY_GET_LATEST_REPORT_SELECTOR.toLowerCase())) return '0x';
        return '0x';
      }
      if (method === 'eth_sendTransaction') return TX_HASH;
      throw new Error(`unsupported ${method}`);
    },
  };
  const networkPreflight = await preflightProofNetworkProvider({ provider, envelope: proof.envelope, transactionRequest: proof.preflight.transactionRequest, payload: proof.preflight.payload, timeoutMs: 1_000 });
  assert.equal(networkPreflight.passed, true);
  assert.equal(networkPreflight.duplicate, false);
  assert.equal(networkPreflight.estimatedFee, '0.00252 USDC');
  const review = await createUserGatedProofReview({ envelope: proof.envelope, preflight: proof.preflight, networkPreflight, disclosureAcknowledged: true, userGesture: true, reviewAcknowledged: true, currentStateBindingDigest: networkPreflight.stateBindingDigest });
  calls.length = 0;
  const result = await submitUserApprovedProofTransaction({ provider, event: click, envelope: proof.envelope, verification: proof.verification, preflight: proof.preflight, networkPreflight, review, currentStateBindingDigest: networkPreflight.stateBindingDigest, timeoutMs: 1_000, revalidationTimeoutMs: 1_000, sendCoordinator: testProofSendCoordinator() });
  assert.equal(result.transactionHash, TX_HASH);
  assert.equal(calls.filter((item) => item.method === 'eth_sendTransaction').length, 1);
});

test('production sources expose no private-key signer or automatic retry fallback', () => {
  const files = [
    'apps/web/v4/proof-send-boundary.js',
    'apps/web/v4/proof-transaction-acceptance.js',
    'apps/web/v4/proof-adapter.js',
    'packages/proof/src/registry.js',
  ];
  const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /private.?key|seed.?phrase|mnemonic|new\s+Wallet|sendRawTransaction/iu);
  const acceptance = fs.readFileSync('apps/web/v4/proof-transaction-acceptance.js', 'utf8');
  assert.equal((acceptance.match(/method:\s*'eth_sendTransaction'/gu) ?? []).length, 1);
});
