import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARC_MAINNET_REGISTRY_ADDRESS, ARC_MAINNET_REGISTRY_RUNTIME_DIGEST,
  DEFAULT_PROOF_NETWORK, PROOF_NETWORKS, assertProofNetworkCapability, assertTrustedNetwork, checksumAddress, prepareRegistryPublish,
  resolveProofNetwork, verifyRegistryRecord,
} from '../../../packages/proof/v4/index.js';
import { ACCOUNT, validEnvelope, validReport } from './helpers.mjs';

function proofContext(overrides = {}) {
  return { report: validReport(), providerChainId: 5_042_002, account: ACCOUNT, signerAvailable: true, ...overrides };
}

test('trusted Arc testnet configuration is versioned and enabled', () => {
  const network = resolveProofNetwork('arc-testnet');
  assert.equal(network.configVersion, '1.0.0');
  assert.equal(network.enabled, true);
  assert.equal(network.chainId, 5_042_002);
});

test('default proof network remains Arc testnet', () => {
  assert.equal(DEFAULT_PROOF_NETWORK, 'arc-testnet');
  assert.equal(resolveProofNetwork().networkKey, 'arc-testnet');
});

test('Arc mainnet configuration is verified for guarded production publishing', () => {
  const network = resolveProofNetwork('arc-mainnet');
  assert.equal(network.networkKey, 'arc-mainnet');
  assert.equal(network.environment, 'mainnet');
  assert.equal(network.isTestnet, false);
  assert.equal(network.chainId, 5_042);
  assert.equal(network.chainIdHex, '0x13b2');
  assert.equal(network.registryAddress, ARC_MAINNET_REGISTRY_ADDRESS);
  assert.equal(network.registryRuntimeBytecodeDigest, ARC_MAINNET_REGISTRY_RUNTIME_DIGEST);
  assert.equal(network.deploymentStatus, 'verified');
  assert.equal(network.enabled, true);
  assert.equal(network.proofReadEnabled, true);
  assert.equal(network.publishEnabled, true);
  assert.equal(network.publicationStatus, 'verified');
});

test('registry address has a valid EIP-55 checksum', () => {
  const address = PROOF_NETWORKS['arc-testnet'].registryAddress;
  assert.equal(checksumAddress(address), address);
});

test('lowercase addresses normalize to checksum form', () => {
  const address = PROOF_NETWORKS['arc-testnet'].registryAddress;
  assert.equal(checksumAddress(address.toLowerCase()), address);
});

test('invalid mixed-case checksum fails closed', () => {
  assert.throws(() => checksumAddress('0x88b4055eaB061CEa9BdfefF524f65ff461B5401d'));
});

test('zero address is rejected', () => {
  assert.throws(() => checksumAddress(`0x${'00'.repeat(20)}`));
});

test('unknown networks fail closed while verified mainnet reads and publishing are trusted', () => {
  assert.throws(() => resolveProofNetwork('arc-devnet'), (error) => error.code === 'PROOF_NETWORK_INVALID');
  assert.equal(assertTrustedNetwork({ networkKey: 'arc-mainnet', providerChainId: 5_042, registryAddress: ARC_MAINNET_REGISTRY_ADDRESS }).networkKey, 'arc-mainnet');
  assert.equal(assertProofNetworkCapability('arc-mainnet', 'publish').networkKey, 'arc-mainnet');
});

test('wrong chain fails before calldata is returned', () => {
  assert.throws(() => prepareRegistryPublish(validEnvelope(), {
    ...proofContext(), providerChainId: 1,
  }), (error) => error.code === 'PROOF_CHAIN_MISMATCH');
});

test('wrong registry fails before calldata is returned', () => {
  assert.throws(() => prepareRegistryPublish(validEnvelope(), {
    ...proofContext(), registryAddress: ACCOUNT,
  }), (error) => error.code === 'PROOF_REGISTRY_MISMATCH');
});

test('missing signer fails closed without wallet invocation', () => {
  assert.throws(() => prepareRegistryPublish(validEnvelope(), {
    ...proofContext(), providerChainId: '0x4cef52', signerAvailable: false,
  }), (error) => error.code === 'PROOF_SIGNER_REQUIRED');
});

test('hex and decimal Arc chain identifiers normalize identically', () => {
  assert.equal(assertTrustedNetwork({ providerChainId: '0x4CEF52' }).chainId, 5_042_002);
  assert.equal(assertTrustedNetwork({ providerChainId: '5042002' }).chainId, 5_042_002);
});

test('malformed and huge chain identifiers fail closed', () => {
  assert.throws(() => assertTrustedNetwork({ providerChainId: '0xnope' }));
  assert.throws(() => assertTrustedNetwork({ providerChainId: Number.MAX_VALUE }));
});

test('matching duplicate publication is idempotent', () => {
  const envelope = validEnvelope();
  const context = proofContext();
  const first = prepareRegistryPublish(envelope, context);
  const record = { ...first.payload, publisher: ACCOUNT, publishedAt: 1 };
  assert.equal(verifyRegistryRecord(record, envelope, { publisher: ACCOUNT }), true);
  const duplicate = prepareRegistryPublish(envelope, { ...context, existingRecord: record });
  assert.equal(duplicate.status, 'already-published');
  assert.equal(duplicate.transactionRequest, null);
});

test('conflicting duplicate fails closed', () => {
  const envelope = validEnvelope();
  const context = proofContext();
  const first = prepareRegistryPublish(envelope, context);
  const record = { ...first.payload, reportHash: `0x${'ff'.repeat(32)}`, publisher: ACCOUNT };
  assert.throws(() => prepareRegistryPublish(envelope, {
    ...context, existingRecord: record,
  }), (error) => error.code === 'PROOF_DUPLICATE_CONFLICT');
});

test('duplicate transaction identity is chain and registry bound', () => {
  const envelope = validEnvelope();
  const context = proofContext();
  const first = prepareRegistryPublish(envelope, context);
  const record = { ...first.payload, publisher: ACCOUNT };
  assert.throws(() => prepareRegistryPublish(envelope, {
    ...context, existingRecord: record,
    existingTransactionIdentity: { chainId: 1, registryAddress: envelope.registryAddress, reportHash: envelope.reportHash, transactionHash: `0x${'aa'.repeat(32)}` },
  }), (error) => error.code === 'PROOF_DUPLICATE_CONFLICT');
});
