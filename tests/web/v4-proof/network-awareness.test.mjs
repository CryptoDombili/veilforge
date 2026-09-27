import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WEB_NETWORKS } from '../../../apps/web/config.js';
import { preflightProofNetworkProvider } from '../../../apps/web/v4/proof-network-preflight.js';
import { assertTrustedProofSend, WEB_PROOF_SEND_ENABLED } from '../../../apps/web/v4/proof-send-boundary.js';
import { submitUserApprovedProofTransaction, WEB_PROOF_USER_APPROVED_SEND_ENABLED } from '../../../apps/web/v4/proof-transaction-acceptance.js';
import { deriveProofWalletUiState, renderProofSummary } from '../../../apps/web/v4/proof-ui.js';
import { safeWebExplorerLink } from '../../../apps/web/v4/proof-receipt.js';
import { publishReport } from '../../../packages/proof/src/registry.js';
import { encodePublishReport } from '../../../packages/proof/src/registry.js';
import { ARC_MAINNET_PROFILE, evaluateDeploymentEvidence } from '../../../packages/analyzer/src/deployment.js';
import { ARC_MAINNET_REGISTRY_ADDRESS, ARC_MAINNET_REGISTRY_RUNTIME_DIGEST, ARC_TESTNET_REGISTRY_ADDRESS, PROOF_NETWORKS } from '../../../packages/proof/v4/network.js';
import { assertMainnetDeploymentConfig, assertMainnetProductionConfig } from '../../../scripts/lib/mainnet-read-activation.mjs';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const TX_HASH = `0x${'ab'.repeat(32)}`;

function countingProvider() {
  const calls = [];
  return { calls, async request(request) { calls.push(request); throw new Error('provider must not be called'); } };
}

function mainnetEnvelope() {
  return {
    networkKey: 'arc-mainnet', chainId: 5_042, registryAddress: ARC_MAINNET_REGISTRY_ADDRESS,
    reportHash: `sha256:${'11'.repeat(32)}`, reportSchemaVersion: '4.1.0', reportHashPayloadVersion: 'veilforge.report.hash.v2',
    reportIntegrityStatus: 'verified', complete: true, incompleteReasonCodes: [], findingSummary: { total: 0 }, policyStatus: 'passed',
    compilerVersion: '0.8.24', registryContractVersion: '2.0.0', envelopeVersion: 'veilforge.proof.v4.1', canonicalPayloadDigest: `sha256:${'22'.repeat(32)}`,
  };
}

test('Arc Mainnet profile and web config activate verified reads without Testnet fallback', () => {
  const mainnet = PROOF_NETWORKS['arc-mainnet'];
  assert.deepEqual({ chainId: mainnet.chainId, registryAddress: mainnet.registryAddress, enabled: mainnet.enabled, proofReadEnabled: mainnet.proofReadEnabled, publishEnabled: mainnet.publishEnabled, deploymentStatus: mainnet.deploymentStatus }, {
    chainId: 5_042, registryAddress: ARC_MAINNET_REGISTRY_ADDRESS, enabled: true, proofReadEnabled: true, publishEnabled: true, deploymentStatus: 'verified',
  });
  assert.equal(WEB_NETWORKS['arc-mainnet'].registryAddress, ARC_MAINNET_REGISTRY_ADDRESS);
  assert.equal(WEB_NETWORKS['arc-mainnet'].registryRuntimeBytecodeDigest, ARC_MAINNET_REGISTRY_RUNTIME_DIGEST);
  assert.notEqual(WEB_NETWORKS['arc-mainnet'].registryAddress, ARC_TESTNET_REGISTRY_ADDRESS);
});

test('publish-oriented Mainnet preflight requires a verified envelope before any provider request', async () => {
  const provider = countingProvider();
  await assert.rejects(() => preflightProofNetworkProvider({ provider, envelope: { networkKey: 'arc-mainnet' } }));
  assert.deepEqual(provider.calls, []);
});

test('Mainnet acceptance cannot reach eth_sendTransaction without a trusted click', async () => {
  const provider = countingProvider();
  assert.equal(WEB_PROOF_SEND_ENABLED, true);
  assert.equal(WEB_PROOF_USER_APPROVED_SEND_ENABLED, true);
  await assert.rejects(() => submitUserApprovedProofTransaction({ provider, envelope: { networkKey: 'arc-mainnet' } }), (error) => error.code === 'WEB_V4_USER_GESTURE_REQUIRED');
  assert.equal(provider.calls.some((call) => call.method === 'eth_sendTransaction'), false);
  assert.deepEqual(provider.calls, []);
});

test('Mainnet trusted send gate accepts only canonical calldata for the verified Registry', () => {
  const mainnet = PROOF_NETWORKS['arc-mainnet'];
  assert.equal(mainnet.registryAddress, ARC_MAINNET_REGISTRY_ADDRESS);
  assert.equal(mainnet.publishEnabled, true);
  const data = encodePublishReport({ projectId: `0x${'01'.repeat(32)}`, sourceHash: `0x${'02'.repeat(32)}`, reportHash: `0x${'03'.repeat(32)}`, score: 0, scannerVersion: 'production-test', reportURI: '' });
  const request = { from: ACCOUNT, to: ARC_MAINNET_REGISTRY_ADDRESS, chainId: '0x13b2', data, value: '0x0' };
  assert.equal(assertTrustedProofSend({ networkKey: 'arc-mainnet', providerChainId: 5_042, registryAddress: ARC_MAINNET_REGISTRY_ADDRESS, transactionRequest: request, userApproved: true }).networkKey, 'arc-mainnet');
  assert.throws(() => assertTrustedProofSend({ networkKey: 'arc-mainnet', providerChainId: 5_042, registryAddress: ARC_TESTNET_REGISTRY_ADDRESS, transactionRequest: { from: ACCOUNT, to: ARC_TESTNET_REGISTRY_ADDRESS, chainId: '0x13b2', data: '0x1234', value: '0x0' }, userApproved: true }));
});

test('legacy publication path requires explicit approval before Mainnet provider access', async () => {
  const provider = countingProvider();
  await assert.rejects(() => publishReport({ provider, networkKey: 'arc-mainnet', registryAddress: ARC_MAINNET_REGISTRY_ADDRESS, account: ACCOUNT, report: {} }), /Explicit user approval/u);
  assert.deepEqual(provider.calls, []);
});

test('trusted send decision rejects wrong chain and untrusted Testnet target', () => {
  const request = { from: ACCOUNT, to: ARC_TESTNET_REGISTRY_ADDRESS, chainId: '0x4cef52', data: '0x1234', value: '0x0' };
  assert.throws(() => assertTrustedProofSend({ networkKey: 'arc-testnet', providerChainId: 5_042, registryAddress: request.to, transactionRequest: request, userApproved: true }));
  assert.throws(() => assertTrustedProofSend({ networkKey: 'arc-testnet', providerChainId: 5_042_002, registryAddress: OTHER, transactionRequest: { ...request, to: OTHER }, userApproved: true }));
});

test('legacy Testnet publication rejects a non-trusted registry before provider access', async () => {
  const provider = countingProvider();
  await assert.rejects(() => publishReport({ provider, registryAddress: OTHER, account: ACCOUNT, report: {}, userApproved: true }), /does not match trusted Arc Testnet/u);
  assert.deepEqual(provider.calls, []);
});

test('explorer links are derived from each selected trusted profile', () => {
  assert.equal(safeWebExplorerLink(TX_HASH, 'arc-testnet'), `${PROOF_NETWORKS['arc-testnet'].explorerBaseUrl}/tx/${TX_HASH}`);
  assert.equal(safeWebExplorerLink(TX_HASH, 'arc-mainnet'), `https://explorer.arc.io/tx/${TX_HASH}`);
});

test('Mainnet UI displays verified Registry reads and enabled guarded publishing', () => {
  const state = deriveProofWalletUiState({ providerAvailable: true, connected: true, account: ACCOUNT, chainId: 5_042 }, 5_042, { networkKey: 'arc-mainnet' });
  assert.equal(state.state, 'connected');
  assert.match(state.description, /Arc Mainnet chain 5042/u);
  const html = renderProofSummary(mainnetEnvelope());
  for (const value of ['Arc Mainnet', '5042', ARC_MAINNET_REGISTRY_ADDRESS, 'Registry status', 'Verified', 'Read', 'Enabled', 'Publishing', `https://explorer.arc.io/address/${ARC_MAINNET_REGISTRY_ADDRESS}`]) assert.match(html, new RegExp(value, 'u'));
  assert.match(html, /<dt>Publishing<\/dt><dd>Enabled<\/dd>/u);
  assert.doesNotMatch(html, /Not deployed \/ unavailable/u);
  assert.doesNotMatch(html, new RegExp(ARC_TESTNET_REGISTRY_ADDRESS, 'iu'));
});

test('analyzer accepts only the verified Arc Mainnet Registry identity', () => {
  assert.equal(ARC_MAINNET_PROFILE.chainId, 5_042);
  const lineage = { sourceHash: `sha256:${'33'.repeat(32)}`, deployment: { networkKey: 'arc-mainnet' } };
  const mismatch = evaluateDeploymentEvidence(lineage, { networkKey: 'arc-mainnet', chainId: 5_042_002, contractAddress: OTHER });
  assert.equal(mismatch.status, 'Network mismatch');
  const mismatchRegistry = evaluateDeploymentEvidence(lineage, { networkKey: 'arc-mainnet', chainId: 5_042, contractAddress: OTHER });
  assert.equal(mismatchRegistry.valid, false);
  assert.equal(mismatchRegistry.status, 'Registry mismatch');
  const verified = evaluateDeploymentEvidence(lineage, { networkKey: 'arc-mainnet', chainId: 5_042, contractAddress: ARC_MAINNET_REGISTRY_ADDRESS, transactionHash: TX_HASH, bytecodeHash: `0x${'cd'.repeat(32)}` });
  assert.equal(verified.valid, true);
  assert.equal(verified.status, 'Evidence linked');
});

test('web build rejects legacy Registry override reuse outside the default Testnet network', () => {
  const source = fs.readFileSync(new URL('../../../scripts/build-web.mjs', import.meta.url), 'utf8');
  assert.match(source, /configuredNetworkKey !== sourceConfig\.DEFAULT_WEB_NETWORK_KEY && legacyRegistryOverride/u);
  assert.match(source, /Legacy registry overrides are Testnet-only/u);
  assert.match(source, /verified production Registry and first-publication evidence profile/u);
});

test('deployment manifest and web config share the exact verified Mainnet identity', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../../deployment/arc-mainnet-registry-deployment.json', import.meta.url), 'utf8'));
  const mainnet = WEB_NETWORKS['arc-mainnet'];
  assert.equal(manifest.chainId, mainnet.chainId);
  assert.equal(manifest.contractAddress, mainnet.registryAddress);
  assert.equal(manifest.transactionHash, mainnet.registryDeploymentTransaction);
  assert.equal(manifest.blockNumber, mainnet.registryDeploymentBlock);
  assert.equal(manifest.runtimeBytecodeDigest, mainnet.registryRuntimeBytecodeDigest);
  assert.equal(manifest.deploymentStatus, mainnet.deploymentStatus);
  assert.equal(assertMainnetDeploymentConfig(manifest, mainnet), true);
  const publication = JSON.parse(fs.readFileSync(new URL('../../../deployment/arc-mainnet-proof-publication.json', import.meta.url), 'utf8'));
  assert.equal(assertMainnetProductionConfig(manifest, publication, mainnet), true);
  assert.throws(() => assertMainnetDeploymentConfig({ ...manifest, contractAddress: OTHER }, mainnet), /do not match/u);
  assert.throws(() => assertMainnetProductionConfig(manifest, { ...publication, transactionHash: TX_HASH }, mainnet), /do not match/u);
});
