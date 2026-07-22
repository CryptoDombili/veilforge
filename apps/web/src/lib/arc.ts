import { ARC_TESTNET, ARC_TESTNET_REGISTRY_ADDRESS, REGISTRY_ABI } from '@veilforge/shared';
import { createPublicClient, createWalletClient, custom, http, keccak256, stringToHex, type Address, type Chain, type EIP1193Provider } from 'viem';

export const arcTestnet: Chain = {
  id: ARC_TESTNET.id,
  name: ARC_TESTNET.name,
  nativeCurrency: ARC_TESTNET.nativeCurrency,
  rpcUrls: {
    default: { http: [ARC_TESTNET.rpcUrl] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: ARC_TESTNET.explorerUrl },
  },
  testnet: true,
};

export interface PublishInput {
  projectName: string;
  sourceHash: `0x${string}`;
  reportHash: `0x${string}`;
  score: number;
  scannerVersion: string;
  reportURI: string;
}

export interface PublishResult {
  account: Address;
  transactionHash: `0x${string}`;
  explorerUrl: string;
  projectId: `0x${string}`;
}

function registryAddress(): Address {
  const address = import.meta.env.VITE_REGISTRY_ADDRESS || ARC_TESTNET_REGISTRY_ADDRESS;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error('The Arc Testnet registry address is invalid.');
  }
  return address as Address;
}

async function ensureArcNetwork(provider: EIP1193Provider): Promise<void> {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${ARC_TESTNET.id.toString(16)}` }],
    });
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: number }).code : undefined;
    if (code !== 4902) throw error;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: `0x${ARC_TESTNET.id.toString(16)}`,
          chainName: ARC_TESTNET.name,
          nativeCurrency: ARC_TESTNET.nativeCurrency,
          rpcUrls: [ARC_TESTNET.rpcUrl],
          blockExplorerUrls: [ARC_TESTNET.explorerUrl],
        },
      ],
    });
  }
}

export async function publishProof(input: PublishInput): Promise<PublishResult> {
  if (!window.ethereum) throw new Error('No browser wallet detected. Install a wallet that supports custom EVM networks.');
  if (!input.projectName.trim()) throw new Error('Project name is required.');
  if (input.projectName.trim().length > 80) throw new Error('Project name must be 80 characters or fewer.');
  if (input.reportURI.length > 512) throw new Error('Report URI must be 512 characters or fewer.');
  if (input.scannerVersion.length > 32) throw new Error('Scanner version metadata is too long.');

  await ensureArcNetwork(window.ethereum);

  const walletClient = createWalletClient({
    chain: arcTestnet,
    transport: custom(window.ethereum),
  });
  const [account] = await walletClient.requestAddresses();
  if (!account) throw new Error('Wallet did not return an account.');

  const projectId = keccak256(stringToHex(input.projectName.trim().toLowerCase()));
  const transactionHash = await walletClient.writeContract({
    account,
    address: registryAddress(),
    abi: REGISTRY_ABI,
    functionName: 'publishReport',
    args: [
      projectId,
      input.sourceHash,
      input.reportHash,
      input.score,
      input.reportURI,
      input.scannerVersion,
    ],
  });

  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_TESTNET.rpcUrl) });
  await publicClient.waitForTransactionReceipt({ hash: transactionHash });

  return {
    account,
    transactionHash,
    explorerUrl: `${ARC_TESTNET.explorerUrl}/tx/${transactionHash}`,
    projectId,
  };
}
