import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ARC_MAINNET_UNRESOLVED,
  MAINNET_PUBLIC_ENVIRONMENT_KEYS,
  MAINNET_SECRET_ENVIRONMENT_KEYS,
  assertMainnetTransactionRequest,
  mainnetRollbackConfig,
  publicationIdentityKey,
  validateMainnetReadinessConfig,
} from '../../../packages/proof/v4/mainnet-readiness.js';
import { buildRegistryDeploymentManifest } from '../../../scripts/rehearse-arc-mainnet-registry.mjs';

const ADDRESS = '0x1111111111111111111111111111111111111111';
const PUBLISHER = '0x2222222222222222222222222222222222222222';
const TX = `0x${'33'.repeat(32)}`;
const verifiedConfig = (overrides = {}) => ({
  ...ARC_MAINNET_UNRESOLVED,
  chainId: 12_345,
  chainName: 'Synthetic Mainnet Fixture',
  nativeFeeAsset: 'USDC',
  rpcPublicReference: 'https://example.test/network-docs',
  explorerBase: 'https://explorer.example.test',
  registryAddress: ADDRESS,
  registryDeploymentBlock: 100,
  registryDeploymentTx: TX,
  deploymentStatus: 'verified',
  enabled: true,
  proofReadEnabled: true,
  publishEnabled: true,
  walletSwitchMetadata: { chainId: 12_345, chainName: 'Synthetic Mainnet Fixture' },
  verificationEvidence: {
    networkSource: 'https://example.test/network-docs',
    deploymentSource: 'https://explorer.example.test/tx/deployment',
  },
  ...overrides,
});

test('mainnet config is explicit, unresolved, and publish-disabled by default', () => {
  assert.equal(ARC_MAINNET_UNRESOLVED.environment, 'mainnet');
  assert.equal(ARC_MAINNET_UNRESOLVED.chainId, null);
  assert.equal(ARC_MAINNET_UNRESOLVED.registryAddress, null);
  assert.equal(ARC_MAINNET_UNRESOLVED.enabled, false);
  assert.equal(ARC_MAINNET_UNRESOLVED.publishEnabled, false);
  assert.equal(ARC_MAINNET_UNRESOLVED.proofReadEnabled, false);
});

test('unresolved and zero-address mainnet configs fail closed', () => {
  assert.throws(() => validateMainnetReadinessConfig(ARC_MAINNET_UNRESOLVED));
  assert.throws(() => validateMainnetReadinessConfig(verifiedConfig({ registryAddress: `0x${'00'.repeat(20)}` })));
});

test('verified values still require explicit read and publish gates', () => {
  assert.throws(() => validateMainnetReadinessConfig(verifiedConfig({ proofReadEnabled: false }), { requireRead: true }), (error) => error.code === 'MAINNET_READ_DISABLED');
  assert.throws(() => validateMainnetReadinessConfig(verifiedConfig({ publishEnabled: false }), { requirePublish: true }), (error) => error.code === 'MAINNET_PUBLISH_DISABLED');
});

test('transaction validation blocks wrong chain, registry, and non-zero value', () => {
  const request = { to: ADDRESS, chainId: 12_345, value: '0x0', data: '0x6133eb3a' };
  assert.equal(assertMainnetTransactionRequest(request, verifiedConfig()), true);
  assert.throws(() => assertMainnetTransactionRequest({ ...request, chainId: 1 }, verifiedConfig()), (error) => error.code === 'MAINNET_CHAIN_MISMATCH');
  assert.throws(() => assertMainnetTransactionRequest({ ...request, to: PUBLISHER }, verifiedConfig()), (error) => error.code === 'MAINNET_REGISTRY_MISMATCH');
  assert.throws(() => assertMainnetTransactionRequest({ ...request, value: '0x1' }, verifiedConfig()), (error) => error.code === 'MAINNET_VALUE_NONZERO');
});

test('publication identity is chain-aware and separates testnet from mainnet', () => {
  const base = { registryAddress: ADDRESS, publisher: PUBLISHER, reportHash: `sha256:${'44'.repeat(32)}` };
  const testnet = publicationIdentityKey({ ...base, networkKey: 'arc-testnet', chainId: 5_042_002 });
  const mainnet = publicationIdentityKey({ ...base, networkKey: 'arc-mainnet', chainId: 12_345 });
  assert.notEqual(testnet, mainnet);
});

test('rollback disables read, publish, sending, feature flag, and registry trust', () => {
  assert.deepEqual(mainnetRollbackConfig(verifiedConfig()), {
    networkKey: 'arc-mainnet', configVersion: '1.0.0', enabled: false, publishEnabled: false,
    proofReadEnabled: false, featureFlagEnabled: false, transactionSendingEnabled: false, registryAddress: null,
  });
});

test('public and secret environment key sets are disjoint and contain no values', () => {
  assert.equal(MAINNET_PUBLIC_ENVIRONMENT_KEYS.some((key) => MAINNET_SECRET_ENVIRONMENT_KEYS.includes(key)), false);
  assert.ok(MAINNET_SECRET_ENVIRONMENT_KEYS.includes('ARC_MAINNET_DEPLOYER_KEY'));
  assert.ok(MAINNET_SECRET_ENVIRONMENT_KEYS.every((key) => /^[A-Z0-9_]+$/u.test(key)));
});

test('deployment rehearsal manifest is deterministic and consistent', () => {
  const first = buildRegistryDeploymentManifest();
  const second = buildRegistryDeploymentManifest();
  assert.deepEqual(first, second);
  assert.match(first.manifestDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(first.manifest.verificationStatus.compile, 'passed');
  assert.equal(first.manifest.verificationStatus.mainnetDeployment, 'not-performed');
  assert.equal(first.manifest.targetNetwork.registryAddress, null);
  assert.equal(first.manifest.expectedSelectors['publishReport(bytes32,bytes32,bytes32,uint16,string,string)'], '6133eb3a');
});

test('Phase 5D source contains no embedded mainnet secret example', () => {
  const files = [
    'packages/proof/v4/mainnet-readiness.js',
    'scripts/rehearse-arc-mainnet-registry.mjs',
    'tests/proof/v4/mainnet-readiness.test.mjs',
  ];
  const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /ARC_MAINNET_DEPLOYER_KEY\s*=\s*\S+/u);
  assert.doesNotMatch(source, /(?:private.?key|seed.?phrase)\s*[:=]\s*["'][^"']+["']/iu);
});

