import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ARC_MAINNET_READ_ONLY,
  ARC_MAINNET_PRODUCTION,
  ARC_MAINNET_UNRESOLVED,
  MAINNET_PUBLIC_ENVIRONMENT_KEYS,
  MAINNET_SECRET_ENVIRONMENT_KEYS,
  assertMainnetTransactionRequest,
  mainnetRollbackConfig,
  mainnetPublishingRollbackConfig,
  publicationIdentityKey,
  validateMainnetReadinessConfig,
} from '../../../packages/proof/v4/mainnet-readiness.js';
import {
  ARC_MAINNET_REGISTRY_ADDRESS,
  ARC_MAINNET_REGISTRY_DEPLOYMENT_BLOCK,
  ARC_MAINNET_REGISTRY_DEPLOYMENT_TX,
  ARC_MAINNET_REGISTRY_RUNTIME_DIGEST,
  ARC_TESTNET_REGISTRY_ADDRESS,
} from '../../../packages/proof/v4/network.js';
import { buildRegistryDeploymentManifest } from '../../../scripts/rehearse-arc-mainnet-registry.mjs';

const ADDRESS = '0x1111111111111111111111111111111111111111';
const PUBLISHER = '0x2222222222222222222222222222222222222222';
const verifiedConfig = (overrides = {}) => ({
  ...ARC_MAINNET_PRODUCTION,
  ...overrides,
});

test('mainnet config is explicit, unresolved, and publish-disabled by default', () => {
  assert.equal(ARC_MAINNET_UNRESOLVED.environment, 'mainnet');
  assert.equal(ARC_MAINNET_UNRESOLVED.chainId, 5_042);
  assert.equal(ARC_MAINNET_UNRESOLVED.registryAddress, null);
  assert.equal(ARC_MAINNET_UNRESOLVED.enabled, false);
  assert.equal(ARC_MAINNET_UNRESOLVED.publishEnabled, false);
  assert.equal(ARC_MAINNET_UNRESOLVED.proofReadEnabled, false);
});

test('valid disabled mainnet configuration is accepted', () => {
  const config = validateMainnetReadinessConfig(ARC_MAINNET_UNRESOLVED);
  assert.equal(config.chainId, 5_042);
  assert.equal(config.registryAddress, null);
  assert.equal(config.deploymentStatus, 'unresolved');
  assert.equal(config.enabled, false);
  assert.equal(config.proofReadEnabled, false);
  assert.equal(config.publishEnabled, false);
});

test('verified Arc Mainnet read-only activation is exact and publish-disabled', () => {
  const config = validateMainnetReadinessConfig(ARC_MAINNET_READ_ONLY, { requireRead: true });
  assert.equal(config.registryAddress, ARC_MAINNET_REGISTRY_ADDRESS);
  assert.equal(config.registryDeploymentTx, ARC_MAINNET_REGISTRY_DEPLOYMENT_TX);
  assert.equal(config.registryDeploymentBlock, ARC_MAINNET_REGISTRY_DEPLOYMENT_BLOCK);
  assert.equal(config.registryRuntimeBytecodeDigest, ARC_MAINNET_REGISTRY_RUNTIME_DIGEST);
  assert.equal(config.enabled, true);
  assert.equal(config.proofReadEnabled, true);
  assert.equal(config.publishEnabled, false);
  assert.throws(() => validateMainnetReadinessConfig(ARC_MAINNET_READ_ONLY, { requirePublish: true }), (error) => error.code === 'MAINNET_PUBLISH_DISABLED');
});

test('verified Arc Mainnet production activation is evidence-bound and publish-enabled', () => {
  const config = validateMainnetReadinessConfig(ARC_MAINNET_PRODUCTION, { requireRead: true, requirePublish: true });
  assert.equal(config.publishEnabled, true);
  assert.equal(config.publicationStatus, 'verified');
  assert.equal(config.firstProofTransaction, '0xc546c684ccc4a04ae2466926972a3c20d53c8b4616022f03240f4319d3de1693');
  assert.equal(config.firstProofBlock, 21_545_612);
});

test('zero-address mainnet registry fails closed', () => {
  assert.throws(() => validateMainnetReadinessConfig(verifiedConfig({ registryAddress: `0x${'00'.repeat(20)}` })));
});

test('Arc testnet and wrong chain identifiers are rejected for mainnet', () => {
  assert.throws(() => validateMainnetReadinessConfig({ ...ARC_MAINNET_UNRESOLVED, chainId: 5_042_002 }), (error) => error.code === 'MAINNET_CHAIN_MISMATCH');
  assert.throws(() => validateMainnetReadinessConfig({ ...ARC_MAINNET_UNRESOLVED, chainId: 1 }), (error) => error.code === 'MAINNET_CHAIN_MISMATCH');
});

test('Arc testnet registry address is rejected for mainnet', () => {
  assert.throws(
    () => validateMainnetReadinessConfig({ ...ARC_MAINNET_UNRESOLVED, registryAddress: ARC_TESTNET_REGISTRY_ADDRESS }),
    (error) => error.code === 'MAINNET_TESTNET_REGISTRY_COLLISION' && error.field === 'registryAddress',
  );
});

test('registry address is required before enabling mainnet reads or publishing', () => {
  assert.throws(
    () => validateMainnetReadinessConfig({ ...ARC_MAINNET_UNRESOLVED, proofReadEnabled: true }),
    (error) => error.code === 'MAINNET_CONFIG_UNRESOLVED' && error.field === 'registryAddress',
  );
  assert.throws(
    () => validateMainnetReadinessConfig({ ...ARC_MAINNET_UNRESOLVED, publishEnabled: true }),
    (error) => error.code === 'MAINNET_CONFIG_UNRESOLVED' && error.field === 'registryAddress',
  );
});

test('publishing remains blocked until deployment is verified', () => {
  assert.throws(
    () => validateMainnetReadinessConfig({
      ...ARC_MAINNET_UNRESOLVED,
      registryAddress: ARC_MAINNET_REGISTRY_ADDRESS,
      enabled: true,
      proofReadEnabled: true,
      publishEnabled: true,
    }),
    (error) => error.code === 'MAINNET_CONFIG_UNVERIFIED' && error.field === 'deploymentStatus',
  );
});

test('verified values still require explicit read and publish gates', () => {
  assert.throws(() => validateMainnetReadinessConfig(verifiedConfig({ proofReadEnabled: false }), { requireRead: true }), (error) => error.code === 'MAINNET_READ_DISABLED');
  assert.throws(() => validateMainnetReadinessConfig(verifiedConfig({ publishEnabled: false }), { requirePublish: true }), (error) => error.code === 'MAINNET_PUBLISH_DISABLED');
});

test('verified deployment rejects local rehearsal identity and runtime drift', () => {
  assert.throws(() => validateMainnetReadinessConfig(verifiedConfig({ registryAddress: ADDRESS })), (error) => error.code === 'MAINNET_REGISTRY_MISMATCH' && error.field === 'registryAddress');
  assert.throws(() => validateMainnetReadinessConfig(verifiedConfig({ registryRuntimeBytecodeDigest: `sha256:${'00'.repeat(32)}` })), (error) => error.code === 'MAINNET_REGISTRY_MISMATCH' && error.field === 'registryRuntimeBytecodeDigest');
});

test('production publishing rejects missing or drifting first-publication evidence', () => {
  assert.throws(() => validateMainnetReadinessConfig({ ...ARC_MAINNET_PRODUCTION, publicationStatus: 'unverified' }, { requirePublish: true }), (error) => error.code === 'MAINNET_CONFIG_UNVERIFIED');
  assert.throws(() => validateMainnetReadinessConfig({ ...ARC_MAINNET_PRODUCTION, firstProofTransaction: `0x${'00'.repeat(32)}` }, { requirePublish: true }), (error) => error.code === 'MAINNET_PUBLICATION_MISMATCH');
});

test('transaction validation blocks wrong chain, registry, selector, and non-zero value', () => {
  const request = { to: ARC_MAINNET_REGISTRY_ADDRESS, chainId: 5_042, value: '0x0', data: `0x6133eb3a${'00'.repeat(192)}` };
  assert.equal(assertMainnetTransactionRequest(request, verifiedConfig()), true);
  assert.throws(() => assertMainnetTransactionRequest({ ...request, chainId: 1 }, verifiedConfig()), (error) => error.code === 'MAINNET_CHAIN_MISMATCH');
  assert.throws(() => assertMainnetTransactionRequest({ ...request, to: PUBLISHER }, verifiedConfig()), (error) => error.code === 'MAINNET_REGISTRY_MISMATCH');
  assert.throws(() => assertMainnetTransactionRequest({ ...request, value: '0x1' }, verifiedConfig()), (error) => error.code === 'MAINNET_VALUE_NONZERO');
  assert.throws(() => assertMainnetTransactionRequest({ ...request, data: `0x12345678${'00'.repeat(192)}` }, verifiedConfig()), (error) => error.code === 'MAINNET_TRANSACTION_INVALID');
});

test('publication identity is chain-aware and separates testnet from mainnet', () => {
  const base = { registryAddress: ADDRESS, publisher: PUBLISHER, reportHash: `sha256:${'44'.repeat(32)}` };
  const testnet = publicationIdentityKey({ ...base, networkKey: 'arc-testnet', chainId: 5_042_002 });
  const mainnet = publicationIdentityKey({ ...base, networkKey: 'arc-mainnet', chainId: 5_042 });
  assert.notEqual(testnet, mainnet);
});

test('rollback disables read, publish, sending, feature flag, and registry trust', () => {
  assert.deepEqual(mainnetRollbackConfig(verifiedConfig()), {
    networkKey: 'arc-mainnet', configVersion: '1.0.0', enabled: false, publishEnabled: false,
    proofReadEnabled: false, featureFlagEnabled: false, transactionSendingEnabled: false, registryAddress: null,
  });
});

test('production publishing rollback preserves verified reads and disables the send capability', () => {
  const rollback = mainnetPublishingRollbackConfig();
  assert.equal(rollback.enabled, true);
  assert.equal(rollback.proofReadEnabled, true);
  assert.equal(rollback.publishEnabled, false);
  assert.equal(rollback.transactionSendingEnabled, false);
  assert.equal(rollback.registryAddress, ARC_MAINNET_REGISTRY_ADDRESS);
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

