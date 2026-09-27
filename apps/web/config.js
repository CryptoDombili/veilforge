import { DEFAULT_PROOF_NETWORK, PROOF_NETWORKS } from '../../packages/proof/v4/network.js';

export const DEFAULT_WEB_NETWORK_KEY = DEFAULT_PROOF_NETWORK;
export const WEB_NETWORKS = Object.freeze(Object.fromEntries(Object.entries(PROOF_NETWORKS).map(([key, network]) => [key, Object.freeze({
  networkKey: network.networkKey,
  chainId: network.chainId,
  chainIdHex: network.chainIdHex,
  chainName: network.chainName,
  registryAddress: network.registryAddress,
  registryContractVersion: network.registryContractVersion,
  registryRuntimeBytecodeDigest: network.registryRuntimeBytecodeDigest ?? null,
  registryDeploymentTransaction: network.registryDeploymentTransaction ?? null,
  registryDeploymentBlock: network.registryDeploymentBlock ?? null,
  firstProofTransaction: network.firstProofTransaction ?? null,
  firstProofBlock: network.firstProofBlock ?? null,
  firstProofPublisher: network.firstProofPublisher ?? null,
  firstProofFixtureId: network.firstProofFixtureId ?? null,
  firstProofProjectId: network.firstProofProjectId ?? null,
  firstProofReportHash: network.firstProofReportHash ?? null,
  publicationStatus: network.publicationStatus ?? null,
  explorerBaseUrl: network.explorerBaseUrl,
  nativeCurrency: network.nativeCurrency,
  rpcUrls: network.rpcUrls,
  blockExplorerUrls: network.blockExplorerUrls,
  enabled: network.enabled === true,
  proofReadEnabled: network.proofReadEnabled === true,
  publishEnabled: network.publishEnabled === true,
  deploymentStatus: network.deploymentStatus,
})])));

export function resolveWebNetworkConfig(networkKey = DEFAULT_WEB_NETWORK_KEY) {
  const network = WEB_NETWORKS[networkKey];
  if (!network) throw new Error(`Unknown proof network: ${networkKey}`);
  return network;
}

// Backward-compatible Testnet export. It is intentionally never used as a Mainnet fallback.
export const REGISTRY_ADDRESS = resolveWebNetworkConfig(DEFAULT_WEB_NETWORK_KEY).registryAddress;
export const BUILD_VERSION = '3.2.2';
export const WEB_V4_ENABLED = false;
