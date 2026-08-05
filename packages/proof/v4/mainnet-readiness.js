import { checksumAddress, normalizeChainId } from './network.js';

export const MAINNET_READINESS_CONFIG_VERSION = '1.0.0';

export const ARC_MAINNET_UNRESOLVED = Object.freeze({
  networkKey: 'arc-mainnet',
  environment: 'mainnet',
  chainId: null,
  chainName: null,
  nativeFeeAsset: null,
  rpcPublicReference: null,
  explorerBase: null,
  registryAddress: null,
  registryContractVersion: '2.0.0',
  registryDeploymentBlock: null,
  registryDeploymentTx: null,
  deploymentStatus: 'unresolved',
  enabled: false,
  publishEnabled: false,
  proofReadEnabled: false,
  walletSwitchMetadata: null,
  configVersion: MAINNET_READINESS_CONFIG_VERSION,
  verificationEvidence: null,
});

export const MAINNET_PUBLIC_ENVIRONMENT_KEYS = Object.freeze([
  'ARC_MAINNET_CHAIN_ID',
  'ARC_MAINNET_EXPLORER_BASE',
  'ARC_MAINNET_REGISTRY_ADDRESS',
]);

export const MAINNET_SECRET_ENVIRONMENT_KEYS = Object.freeze([
  'ARC_MAINNET_RPC_URL',
  'ARC_MAINNET_DEPLOYER_KEY',
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

export function validateMainnetReadinessConfig(config, { requireRead = false, requirePublish = false } = {}) {
  if (!config || config.networkKey !== 'arc-mainnet' || config.environment !== 'mainnet') {
    throw readinessError('MAINNET_CONFIG_INVALID', 'networkKey');
  }
  if (config.configVersion !== MAINNET_READINESS_CONFIG_VERSION) throw readinessError('MAINNET_CONFIG_INVALID', 'configVersion');
  if (config.deploymentStatus !== 'verified') throw readinessError('MAINNET_CONFIG_UNRESOLVED', 'deploymentStatus');
  if (config.enabled !== true) throw readinessError('MAINNET_CONFIG_DISABLED', 'enabled');
  const chainId = normalizeChainId(config.chainId);
  const chainName = String(config.chainName ?? '').trim();
  const nativeFeeAsset = String(config.nativeFeeAsset ?? '').trim();
  if (!chainName) throw readinessError('MAINNET_CONFIG_UNRESOLVED', 'chainName');
  if (!nativeFeeAsset) throw readinessError('MAINNET_CONFIG_UNRESOLVED', 'nativeFeeAsset');
  const rpcPublicReference = requireHttps(config.rpcPublicReference, 'rpcPublicReference');
  const explorerBase = requireHttps(config.explorerBase, 'explorerBase');
  const registryAddress = checksumAddress(config.registryAddress, 'registryAddress');
  if (config.registryContractVersion !== '2.0.0') throw readinessError('MAINNET_REGISTRY_MISMATCH', 'registryContractVersion');
  const registryDeploymentBlock = normalizeChainId(config.registryDeploymentBlock);
  const registryDeploymentTx = requireTransactionHash(config.registryDeploymentTx, 'registryDeploymentTx');
  if (!config.verificationEvidence || typeof config.verificationEvidence !== 'object') {
    throw readinessError('MAINNET_CONFIG_UNVERIFIED', 'verificationEvidence');
  }
  requireHttps(config.verificationEvidence.networkSource, 'verificationEvidence.networkSource');
  requireHttps(config.verificationEvidence.deploymentSource, 'verificationEvidence.deploymentSource');
  const wallet = config.walletSwitchMetadata;
  if (!wallet || normalizeChainId(wallet.chainId) !== chainId || wallet.chainName !== chainName) {
    throw readinessError('MAINNET_CONFIG_INVALID', 'walletSwitchMetadata');
  }
  if (requireRead && config.proofReadEnabled !== true) throw readinessError('MAINNET_READ_DISABLED', 'proofReadEnabled');
  if (requirePublish && config.publishEnabled !== true) throw readinessError('MAINNET_PUBLISH_DISABLED', 'publishEnabled');
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
    enabled: true,
    publishEnabled: config.publishEnabled === true,
    proofReadEnabled: config.proofReadEnabled === true,
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
  if (!/^0x[0-9a-fA-F]+$/u.test(String(transactionRequest.data ?? ''))) throw readinessError('MAINNET_TRANSACTION_INVALID', 'data');
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

