import {
  ARC_MAINNET_CHAIN_ID,
  ARC_MAINNET_EXPLORER_URL,
  ARC_MAINNET_FIRST_PROOF_BLOCK,
  ARC_MAINNET_FIRST_PROOF_PUBLISHER,
  ARC_MAINNET_FIRST_PROOF_TX,
  ARC_MAINNET_REGISTRY_ADDRESS,
  ARC_MAINNET_REGISTRY_DEPLOYMENT_BLOCK,
  ARC_MAINNET_REGISTRY_DEPLOYMENT_TX,
  ARC_MAINNET_REGISTRY_RUNTIME_DIGEST,
  ARC_MAINNET_RPC_URL,
  ARC_MAINNET_SMOKE_PROJECT_ID,
  ARC_MAINNET_SMOKE_REPORT_HASH,
  ARC_TESTNET_REGISTRY_ADDRESS,
  checksumAddress,
  normalizeChainId,
  resolveProofNetwork,
} from './network.js';

export const MAINNET_READINESS_CONFIG_VERSION = '1.0.0';
const ARC_MAINNET_NETWORK = resolveProofNetwork('arc-mainnet');
const MAINNET_DEPLOYMENT_STATUSES = new Set(['unresolved', 'prepared', 'deployed-unverified', 'verified']);

export const ARC_MAINNET_UNRESOLVED = Object.freeze({
  networkKey: ARC_MAINNET_NETWORK.networkKey,
  environment: ARC_MAINNET_NETWORK.environment,
  chainId: ARC_MAINNET_NETWORK.chainId,
  chainName: ARC_MAINNET_NETWORK.chainName,
  nativeFeeAsset: null,
  rpcPublicReference: null,
  explorerBase: null,
  registryAddress: null,
  registryContractVersion: '2.0.0',
  registryDeploymentBlock: null,
  registryDeploymentTx: null,
  registryRuntimeBytecodeDigest: null,
  deploymentStatus: 'unresolved',
  enabled: false,
  publishEnabled: false,
  proofReadEnabled: false,
  walletSwitchMetadata: null,
  configVersion: MAINNET_READINESS_CONFIG_VERSION,
  verificationEvidence: null,
});

export const ARC_MAINNET_READ_ONLY = Object.freeze({
  networkKey: ARC_MAINNET_NETWORK.networkKey,
  environment: ARC_MAINNET_NETWORK.environment,
  chainId: ARC_MAINNET_CHAIN_ID,
  chainName: ARC_MAINNET_NETWORK.chainName,
  nativeFeeAsset: 'USDC',
  rpcPublicReference: ARC_MAINNET_RPC_URL,
  explorerBase: ARC_MAINNET_EXPLORER_URL,
  registryAddress: ARC_MAINNET_REGISTRY_ADDRESS,
  registryContractVersion: '2.0.0',
  registryDeploymentBlock: ARC_MAINNET_REGISTRY_DEPLOYMENT_BLOCK,
  registryDeploymentTx: ARC_MAINNET_REGISTRY_DEPLOYMENT_TX,
  registryRuntimeBytecodeDigest: ARC_MAINNET_REGISTRY_RUNTIME_DIGEST,
  deploymentStatus: 'verified',
  enabled: true,
  publishEnabled: false,
  proofReadEnabled: true,
  walletSwitchMetadata: Object.freeze({ chainId: ARC_MAINNET_CHAIN_ID, chainName: ARC_MAINNET_NETWORK.chainName }),
  configVersion: MAINNET_READINESS_CONFIG_VERSION,
  verificationEvidence: Object.freeze({
    networkSource: ARC_MAINNET_RPC_URL,
    deploymentSource: `${ARC_MAINNET_EXPLORER_URL}/tx/${ARC_MAINNET_REGISTRY_DEPLOYMENT_TX}`,
    runtimeBytecodeDigest: ARC_MAINNET_REGISTRY_RUNTIME_DIGEST,
  }),
});

export const ARC_MAINNET_PRODUCTION = Object.freeze({
  ...ARC_MAINNET_READ_ONLY,
  publishEnabled: true,
  publicationStatus: 'verified',
  firstProofTransaction: ARC_MAINNET_FIRST_PROOF_TX,
  firstProofBlock: ARC_MAINNET_FIRST_PROOF_BLOCK,
  firstProofPublisher: ARC_MAINNET_FIRST_PROOF_PUBLISHER,
  firstProofProjectId: ARC_MAINNET_SMOKE_PROJECT_ID,
  firstProofReportHash: ARC_MAINNET_SMOKE_REPORT_HASH,
  publicationEvidence: Object.freeze({
    transactionSource: `${ARC_MAINNET_EXPLORER_URL}/tx/${ARC_MAINNET_FIRST_PROOF_TX}`,
    projectId: ARC_MAINNET_SMOKE_PROJECT_ID,
    reportHash: ARC_MAINNET_SMOKE_REPORT_HASH,
  }),
});

export const MAINNET_PUBLIC_ENVIRONMENT_KEYS = Object.freeze([
  'ARC_MAINNET_CHAIN_ID',
  'ARC_MAINNET_EXPLORER_BASE',
  'ARC_MAINNET_REGISTRY_ADDRESS',
]);

export const MAINNET_SECRET_ENVIRONMENT_KEYS = Object.freeze([
  'ARC_MAINNET_RPC_URL',
  'ARC_MAINNET_DEPLOYER_KEY',
  'VEILFORGE_ARC_MAINNET_RPC_URL',
  'VEILFORGE_DEPLOYER_PRIVATE_KEY',
  'VEILFORGE_RELEASE_SIGNING_KEY',
  'ARC_MAINNET_MONITORING_TOKEN',
  'ARC_MAINNET_ADMIN_CREDENTIAL',
]);

function readinessError(code, field) {
  const error = new Error(`Arc mainnet readiness blocked: ${code}.`);
  error.code = code;
  error.field = field;
  return error;
}

function requireHttps(value, field) {
  let url;
  try { url = new URL(String(value)); } catch { throw readinessError('MAINNET_CONFIG_UNRESOLVED', field); }
  if (url.protocol !== 'https:' || url.username || url.password) throw readinessError('MAINNET_CONFIG_UNRESOLVED', field);
  return url.toString().replace(/\/$/u, '');
}

function requireTransactionHash(value, field) {
  const normalized = String(value ?? '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(normalized)) throw readinessError('MAINNET_CONFIG_UNRESOLVED', field);
  return normalized;
}

function requireSha256Digest(value, field) {
  const normalized = String(value ?? '').toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/u.test(normalized)) throw readinessError('MAINNET_CONFIG_UNRESOLVED', field);
  return normalized;
}

function requireBytes32(value, field) {
  const normalized = String(value ?? '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(normalized)) throw readinessError('MAINNET_CONFIG_UNRESOLVED', field);
  return normalized;
}

function requireBoolean(value, field) {
  if (typeof value !== 'boolean') throw readinessError('MAINNET_CONFIG_INVALID', field);
  return value;
}

function normalizeMainnetChainId(value) {
  let chainId;
  try { chainId = normalizeChainId(value); }
  catch { throw readinessError('MAINNET_CHAIN_MISMATCH', 'chainId'); }
  if (chainId !== ARC_MAINNET_CHAIN_ID) throw readinessError('MAINNET_CHAIN_MISMATCH', 'chainId');
  return chainId;
}

function normalizeMainnetRegistryAddress(value) {
  if (value === null) return null;
  let address;
  try { address = checksumAddress(value, 'registryAddress'); }
  catch { throw readinessError('MAINNET_REGISTRY_MISMATCH', 'registryAddress'); }
  if (address.toLowerCase() === ARC_TESTNET_REGISTRY_ADDRESS.toLowerCase()) {
    throw readinessError('MAINNET_TESTNET_REGISTRY_COLLISION', 'registryAddress');
  }
  return address;
}

export function validateMainnetReadinessConfig(config, { requireRead = false, requirePublish = false } = {}) {
  if (!config || config.networkKey !== 'arc-mainnet' || config.environment !== 'mainnet') {
    throw readinessError('MAINNET_CONFIG_INVALID', 'networkKey');
  }
  if (config.configVersion !== MAINNET_READINESS_CONFIG_VERSION) throw readinessError('MAINNET_CONFIG_INVALID', 'configVersion');
  const chainId = normalizeMainnetChainId(config.chainId);
  const enabled = requireBoolean(config.enabled, 'enabled');
  const proofReadEnabled = requireBoolean(config.proofReadEnabled, 'proofReadEnabled');
  const publishEnabled = requireBoolean(config.publishEnabled, 'publishEnabled');
  const deploymentStatus = String(config.deploymentStatus ?? '');
  if (!MAINNET_DEPLOYMENT_STATUSES.has(deploymentStatus)) throw readinessError('MAINNET_CONFIG_INVALID', 'deploymentStatus');
  if (requireRead && !proofReadEnabled) throw readinessError('MAINNET_READ_DISABLED', 'proofReadEnabled');
  if (requirePublish && !publishEnabled) throw readinessError('MAINNET_PUBLISH_DISABLED', 'publishEnabled');

  const registryAddress = normalizeMainnetRegistryAddress(config.registryAddress);
  if (registryAddress === null && proofReadEnabled) throw readinessError('MAINNET_CONFIG_UNRESOLVED', 'registryAddress');
  if (registryAddress === null && publishEnabled) throw readinessError('MAINNET_CONFIG_UNRESOLVED', 'registryAddress');
  if (publishEnabled && deploymentStatus !== 'verified') throw readinessError('MAINNET_CONFIG_UNVERIFIED', 'deploymentStatus');
  if (proofReadEnabled && deploymentStatus !== 'verified') throw readinessError('MAINNET_CONFIG_UNVERIFIED', 'deploymentStatus');
  if ((proofReadEnabled || publishEnabled) && !enabled) throw readinessError('MAINNET_CONFIG_DISABLED', 'enabled');
  if (publishEnabled && !proofReadEnabled) throw readinessError('MAINNET_READ_DISABLED', 'proofReadEnabled');
  if (enabled && deploymentStatus !== 'verified') throw readinessError('MAINNET_CONFIG_UNVERIFIED', 'deploymentStatus');

  if (config.registryContractVersion !== '2.0.0') throw readinessError('MAINNET_REGISTRY_MISMATCH', 'registryContractVersion');
  let chainName = config.chainName === null ? null : String(config.chainName ?? '').trim();
  let nativeFeeAsset = config.nativeFeeAsset === null ? null : String(config.nativeFeeAsset ?? '').trim();
  let rpcPublicReference = null;
  let explorerBase = null;
  let registryDeploymentBlock = null;
  let registryDeploymentTx = null;
  let registryRuntimeBytecodeDigest = null;
  let publicationStatus = null;
  let firstProofTransaction = null;
  let firstProofBlock = null;
  let firstProofPublisher = null;
  let firstProofProjectId = null;
  let firstProofReportHash = null;
  if (deploymentStatus === 'verified') {
    if (registryAddress === null) throw readinessError('MAINNET_CONFIG_UNRESOLVED', 'registryAddress');
    if (!chainName) throw readinessError('MAINNET_CONFIG_UNRESOLVED', 'chainName');
    if (!nativeFeeAsset) throw readinessError('MAINNET_CONFIG_UNRESOLVED', 'nativeFeeAsset');
    rpcPublicReference = requireHttps(config.rpcPublicReference, 'rpcPublicReference');
    explorerBase = requireHttps(config.explorerBase, 'explorerBase');
    try { registryDeploymentBlock = normalizeChainId(config.registryDeploymentBlock); }
    catch { throw readinessError('MAINNET_CONFIG_UNRESOLVED', 'registryDeploymentBlock'); }
    registryDeploymentTx = requireTransactionHash(config.registryDeploymentTx, 'registryDeploymentTx');
    registryRuntimeBytecodeDigest = requireSha256Digest(config.registryRuntimeBytecodeDigest, 'registryRuntimeBytecodeDigest');
    if (registryAddress.toLowerCase() !== ARC_MAINNET_REGISTRY_ADDRESS.toLowerCase()) throw readinessError('MAINNET_REGISTRY_MISMATCH', 'registryAddress');
    if (registryDeploymentBlock !== ARC_MAINNET_REGISTRY_DEPLOYMENT_BLOCK) throw readinessError('MAINNET_REGISTRY_MISMATCH', 'registryDeploymentBlock');
    if (registryDeploymentTx !== ARC_MAINNET_REGISTRY_DEPLOYMENT_TX) throw readinessError('MAINNET_REGISTRY_MISMATCH', 'registryDeploymentTx');
    if (registryRuntimeBytecodeDigest !== ARC_MAINNET_REGISTRY_RUNTIME_DIGEST) throw readinessError('MAINNET_REGISTRY_MISMATCH', 'registryRuntimeBytecodeDigest');
    if (!config.verificationEvidence || typeof config.verificationEvidence !== 'object') {
      throw readinessError('MAINNET_CONFIG_UNVERIFIED', 'verificationEvidence');
    }
    requireHttps(config.verificationEvidence.networkSource, 'verificationEvidence.networkSource');
    requireHttps(config.verificationEvidence.deploymentSource, 'verificationEvidence.deploymentSource');
    if (requireSha256Digest(config.verificationEvidence.runtimeBytecodeDigest, 'verificationEvidence.runtimeBytecodeDigest') !== registryRuntimeBytecodeDigest) {
      throw readinessError('MAINNET_REGISTRY_MISMATCH', 'verificationEvidence.runtimeBytecodeDigest');
    }
    const wallet = config.walletSwitchMetadata;
    let walletChainId;
    try { walletChainId = normalizeChainId(wallet?.chainId); }
    catch { throw readinessError('MAINNET_CONFIG_INVALID', 'walletSwitchMetadata'); }
    if (!wallet || walletChainId !== chainId || wallet.chainName !== chainName) {
      throw readinessError('MAINNET_CONFIG_INVALID', 'walletSwitchMetadata');
    }
    if (publishEnabled) {
      publicationStatus = String(config.publicationStatus ?? '');
      if (publicationStatus !== 'verified') throw readinessError('MAINNET_CONFIG_UNVERIFIED', 'publicationStatus');
      firstProofTransaction = requireTransactionHash(config.firstProofTransaction, 'firstProofTransaction');
      try { firstProofBlock = normalizeChainId(config.firstProofBlock); }
      catch { throw readinessError('MAINNET_CONFIG_UNRESOLVED', 'firstProofBlock'); }
      try { firstProofPublisher = checksumAddress(config.firstProofPublisher, 'firstProofPublisher'); }
      catch { throw readinessError('MAINNET_CONFIG_UNRESOLVED', 'firstProofPublisher'); }
      firstProofProjectId = requireBytes32(config.firstProofProjectId, 'firstProofProjectId');
      firstProofReportHash = requireBytes32(config.firstProofReportHash, 'firstProofReportHash');
      if (firstProofTransaction !== ARC_MAINNET_FIRST_PROOF_TX
        || firstProofBlock !== ARC_MAINNET_FIRST_PROOF_BLOCK
        || firstProofPublisher.toLowerCase() !== ARC_MAINNET_FIRST_PROOF_PUBLISHER.toLowerCase()
        || firstProofProjectId !== ARC_MAINNET_SMOKE_PROJECT_ID
        || firstProofReportHash !== ARC_MAINNET_SMOKE_REPORT_HASH) {
        throw readinessError('MAINNET_PUBLICATION_MISMATCH', 'publicationEvidence');
      }
      if (!config.publicationEvidence || typeof config.publicationEvidence !== 'object'
        || requireHttps(config.publicationEvidence.transactionSource, 'publicationEvidence.transactionSource') !== `${ARC_MAINNET_EXPLORER_URL}/tx/${ARC_MAINNET_FIRST_PROOF_TX}`
        || requireBytes32(config.publicationEvidence.projectId, 'publicationEvidence.projectId') !== ARC_MAINNET_SMOKE_PROJECT_ID
        || requireBytes32(config.publicationEvidence.reportHash, 'publicationEvidence.reportHash') !== ARC_MAINNET_SMOKE_REPORT_HASH) {
        throw readinessError('MAINNET_PUBLICATION_MISMATCH', 'publicationEvidence');
      }
    }
  } else if (enabled) {
    throw readinessError('MAINNET_CONFIG_UNVERIFIED', 'deploymentStatus');
  }

  return Object.freeze({
    networkKey: config.networkKey,
    environment: config.environment,
    chainId,
    chainName,
    nativeFeeAsset,
    rpcPublicReference,
    explorerBase,
    registryAddress,
    registryContractVersion: config.registryContractVersion,
    registryDeploymentBlock,
    registryDeploymentTx,
    registryRuntimeBytecodeDigest,
    publicationStatus,
    firstProofTransaction,
    firstProofBlock,
    firstProofPublisher,
    firstProofProjectId,
    firstProofReportHash,
    deploymentStatus,
    enabled,
    publishEnabled,
    proofReadEnabled,
    configVersion: config.configVersion,
  });
}

export function assertMainnetTransactionRequest(transactionRequest, config) {
  const trusted = validateMainnetReadinessConfig(config, { requireRead: true, requirePublish: true });
  if (!transactionRequest || typeof transactionRequest !== 'object') throw readinessError('MAINNET_TRANSACTION_INVALID', 'transactionRequest');
  if (String(transactionRequest.to ?? '').toLowerCase() !== trusted.registryAddress.toLowerCase()) {
    throw readinessError('MAINNET_REGISTRY_MISMATCH', 'to');
  }
  if (normalizeChainId(transactionRequest.chainId) !== trusted.chainId) throw readinessError('MAINNET_CHAIN_MISMATCH', 'chainId');
  if (transactionRequest.value !== '0x0') throw readinessError('MAINNET_VALUE_NONZERO', 'value');
  if (!/^0x6133eb3a[0-9a-fA-F]+$/u.test(String(transactionRequest.data ?? '')) || String(transactionRequest.data).length < 10 + (64 * 6)) throw readinessError('MAINNET_TRANSACTION_INVALID', 'data');
  return true;
}

export function publicationIdentityKey({ networkKey, chainId, registryAddress, publisher, reportHash } = {}) {
  if (!networkKey || !reportHash) throw readinessError('MAINNET_IDENTITY_INVALID', 'identity');
  return [
    String(networkKey),
    String(normalizeChainId(chainId)),
    checksumAddress(registryAddress, 'registryAddress').toLowerCase(),
    checksumAddress(publisher, 'publisher').toLowerCase(),
    String(reportHash).toLowerCase(),
  ].join(':');
}

export function mainnetRollbackConfig(config = ARC_MAINNET_UNRESOLVED) {
  return Object.freeze({
    networkKey: config.networkKey,
    configVersion: config.configVersion,
    enabled: false,
    publishEnabled: false,
    proofReadEnabled: false,
    featureFlagEnabled: false,
    transactionSendingEnabled: false,
    registryAddress: null,
  });
}

export function mainnetPublishingRollbackConfig(config = ARC_MAINNET_PRODUCTION) {
  const trusted = validateMainnetReadinessConfig(config, { requireRead: true });
  return Object.freeze({
    ...config,
    networkKey: trusted.networkKey,
    chainId: trusted.chainId,
    registryAddress: trusted.registryAddress,
    enabled: true,
    proofReadEnabled: true,
    publishEnabled: false,
    transactionSendingEnabled: false,
  });
}

