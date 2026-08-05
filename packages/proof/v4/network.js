import { keccakHex } from '../../analyzer/src/keccak.js';
import { proofError } from './errors.js';

export const PROOF_NETWORK_CONFIG_VERSION = '1.0.0';
export const DEFAULT_PROOF_NETWORK = 'arc-testnet';

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
    rpcRole: 'public-read-only-reference',
    registryAddress: '0x88B4055eaB061CEa9BdfefF524f65ff461B5401d',
    registryContractVersion: '2.0.0',
    enabled: true,
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
  if (!network?.enabled) throw proofError('PROOF_NETWORK_INVALID', { networkKey });
  checksumAddress(network.registryAddress);
  return network;
}

export function assertTrustedNetwork({ networkKey = DEFAULT_PROOF_NETWORK, providerChainId, registryAddress } = {}) {
  const network = resolveProofNetwork(networkKey);
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
