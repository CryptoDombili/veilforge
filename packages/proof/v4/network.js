import { keccakHex } from '../../analyzer/src/keccak.js';
import { proofError } from './errors.js';

export const PROOF_NETWORK_CONFIG_VERSION = '1.0.0';
export const DEFAULT_PROOF_NETWORK = 'arc-testnet';
export const ARC_TESTNET_REGISTRY_ADDRESS = '0x88B4055eaB061CEa9BdfefF524f65ff461B5401d';
export const ARC_MAINNET_CHAIN_ID = 5_042;
export const ARC_MAINNET_CHAIN_ID_HEX = '0x13b2';
export const ARC_MAINNET_REGISTRY_ADDRESS = '0x43D76BfCa31eAd660C5d804FEe20d14C0c577337';
export const ARC_MAINNET_REGISTRY_RUNTIME_DIGEST = 'sha256:183a480c37821dbdf8212a0454313c45f0ea49569448e712b0524bbfafab145d';
export const ARC_MAINNET_REGISTRY_DEPLOYMENT_TX = '0x2ad90b2d3c1343295cffbd770ae584bc6f086c0010aabc985ad1af1f8644789f';
export const ARC_MAINNET_REGISTRY_DEPLOYMENT_BLOCK = 21_532_278;
export const ARC_MAINNET_RPC_URL = 'https://rpc.mainnet.arc.io';
export const ARC_MAINNET_EXPLORER_URL = 'https://explorer.arc.io';
export const ARC_MAINNET_FIRST_PROOF_TX = '0xc546c684ccc4a04ae2466926972a3c20d53c8b4616022f03240f4319d3de1693';
export const ARC_MAINNET_FIRST_PROOF_BLOCK = 21_545_612;
export const ARC_MAINNET_FIRST_PROOF_PUBLISHER = '0x17aDD951d71A3c79Cfa389A61f7494F3a8146E4b';
export const ARC_MAINNET_SMOKE_FIXTURE_ID = 'veilforge-mainnet-smoke-v1';
export const ARC_MAINNET_SMOKE_PROJECT_ID = '0x79eaebf2c0f45acf6b7b020c6f41251697c2da74ee89cdbd891095b5e8d9bef6';
export const ARC_MAINNET_SMOKE_REPORT_HASH = '0x2975be1220e026f3b2768b59d212bda840569890e905cf4c3098d3b3d166ec4a';

export const PROOF_NETWORKS = Object.freeze({
  [DEFAULT_PROOF_NETWORK]: Object.freeze({
    configVersion: PROOF_NETWORK_CONFIG_VERSION,
    networkKey: DEFAULT_PROOF_NETWORK,
    environment: 'testnet',
    isTestnet: true,
    chainId: 5_042_002,
    chainIdHex: '0x4cef52',
    chainName: 'Arc Testnet',
    explorerBaseUrl: 'https://testnet.arcscan.app',
    nativeCurrency: Object.freeze({ name: 'USDC', symbol: 'USDC', decimals: 18 }),
    rpcUrls: Object.freeze(['https://rpc.testnet.arc.network']),
    blockExplorerUrls: Object.freeze(['https://testnet.arcscan.app']),
    rpcRole: 'public-read-only-reference',
    registryAddress: ARC_TESTNET_REGISTRY_ADDRESS,
    registryContractVersion: '2.0.0',
    enabled: true,
    proofReadEnabled: true,
    publishEnabled: true,
    deploymentStatus: 'verified',
  }),
  'arc-mainnet': Object.freeze({
    configVersion: PROOF_NETWORK_CONFIG_VERSION,
    networkKey: 'arc-mainnet',
    environment: 'mainnet',
    isTestnet: false,
    chainId: ARC_MAINNET_CHAIN_ID,
    chainIdHex: ARC_MAINNET_CHAIN_ID_HEX,
    chainName: 'Arc Mainnet',
    explorerBaseUrl: ARC_MAINNET_EXPLORER_URL,
    nativeCurrency: Object.freeze({ name: 'USDC', symbol: 'USDC', decimals: 18 }),
    rpcUrls: Object.freeze([ARC_MAINNET_RPC_URL]),
    blockExplorerUrls: Object.freeze([ARC_MAINNET_EXPLORER_URL]),
    rpcRole: 'public-read-only-reference',
    registryAddress: ARC_MAINNET_REGISTRY_ADDRESS,
    registryContractVersion: '2.0.0',
    registryRuntimeBytecodeDigest: ARC_MAINNET_REGISTRY_RUNTIME_DIGEST,
    registryDeploymentTransaction: ARC_MAINNET_REGISTRY_DEPLOYMENT_TX,
    registryDeploymentBlock: ARC_MAINNET_REGISTRY_DEPLOYMENT_BLOCK,
    firstProofTransaction: ARC_MAINNET_FIRST_PROOF_TX,
    firstProofBlock: ARC_MAINNET_FIRST_PROOF_BLOCK,
    firstProofPublisher: ARC_MAINNET_FIRST_PROOF_PUBLISHER,
    firstProofFixtureId: ARC_MAINNET_SMOKE_FIXTURE_ID,
    firstProofProjectId: ARC_MAINNET_SMOKE_PROJECT_ID,
    firstProofReportHash: ARC_MAINNET_SMOKE_REPORT_HASH,
    publicationStatus: 'verified',
    enabled: true,
    proofReadEnabled: true,
    publishEnabled: true,
    deploymentStatus: 'verified',
  }),
});

export function checksumAddress(value, field = 'address') {
  const address = String(value ?? '');
  if (!/^0x[0-9a-fA-F]{40}$/u.test(address)) throw proofError('PROOF_REGISTRY_MISMATCH', { field });
  const lower = address.slice(2).toLowerCase();
  if (/^0{40}$/u.test(lower)) throw proofError('PROOF_REGISTRY_MISMATCH', { field });
  const hash = keccakHex(lower).slice(2);
  const checksum = `0x${[...lower].map((character, index) => (
    /[a-f]/u.test(character) && Number.parseInt(hash[index], 16) >= 8 ? character.toUpperCase() : character
  )).join('')}`;
  if (address.slice(2) !== lower && address.slice(2) !== lower.toUpperCase() && address !== checksum) {
    throw proofError('PROOF_REGISTRY_MISMATCH', { field });
  }
  return checksum;
}

export function normalizeChainId(value) {
  const parsed = typeof value === 'string' && /^0x[0-9a-f]+$/iu.test(value)
    ? Number.parseInt(value, 16)
    : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw proofError('PROOF_CHAIN_MISMATCH', { actual: String(value) });
  return parsed;
}

export function resolveProofNetwork(networkKey = DEFAULT_PROOF_NETWORK) {
  const network = PROOF_NETWORKS[networkKey];
  if (!network) throw proofError('PROOF_NETWORK_INVALID', { networkKey });
  if (network.registryAddress !== null) checksumAddress(network.registryAddress);
  return network;
}

export function assertProofNetworkCapability(networkKey = DEFAULT_PROOF_NETWORK, operation = 'read') {
  const network = resolveProofNetwork(networkKey);
  if (network.enabled !== true || network.registryAddress === null) {
    throw proofError('PROOF_NETWORK_INVALID', { networkKey, reason: 'network-disabled-or-unresolved' });
  }
  if (operation === 'read' && network.proofReadEnabled !== true) {
    throw proofError('PROOF_NETWORK_INVALID', { networkKey, reason: 'proof-read-disabled' });
  }
  if (operation === 'publish' && network.publishEnabled !== true) {
    throw proofError('PROOF_NETWORK_INVALID', { networkKey, reason: 'proof-publish-disabled' });
  }
  if (network.environment === 'mainnet') {
    if (network.deploymentStatus !== 'verified') {
      throw proofError('PROOF_NETWORK_INVALID', { networkKey, reason: 'deployment-unverified' });
    }
    if (network.registryAddress.toLowerCase() === ARC_TESTNET_REGISTRY_ADDRESS.toLowerCase()) {
      throw proofError('PROOF_REGISTRY_MISMATCH', { networkKey, reason: 'testnet-registry-on-mainnet' });
    }
  }
  return network;
}

export function assertTrustedNetwork({ networkKey = DEFAULT_PROOF_NETWORK, providerChainId, registryAddress, operation = 'read' } = {}) {
  const network = assertProofNetworkCapability(networkKey, operation);
  const chainId = normalizeChainId(providerChainId);
  if (chainId !== network.chainId) {
    throw proofError('PROOF_CHAIN_MISMATCH', { expected: network.chainId, actual: chainId });
  }
  const registry = checksumAddress(registryAddress ?? network.registryAddress, 'registryAddress');
  if (registry.toLowerCase() !== network.registryAddress.toLowerCase()) {
    throw proofError('PROOF_REGISTRY_MISMATCH', { expected: network.registryAddress, actual: registry });
  }
  return network;
}
