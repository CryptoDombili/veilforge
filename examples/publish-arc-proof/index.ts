import { ARC_TESTNET_REGISTRY_ADDRESS, REGISTRY_ABI } from '@veilforge/shared';
import { createWalletClient, custom, keccak256, stringToHex } from 'viem';

// Browser example. `report` is the result of scanSources(files).
export async function publishVeilForgeProof(report: {
  sourceHash: `0x${string}`;
  reportHash: `0x${string}`;
  score: number;
  scannerVersion: string;
}, projectName: string): Promise<`0x${string}`> {
  if (!window.ethereum) throw new Error('Wallet required');
  const wallet = createWalletClient({ transport: custom(window.ethereum) });
  const [account] = await wallet.requestAddresses();
  if (!account) throw new Error('No wallet account');

  return wallet.writeContract({
    account,
    address: ARC_TESTNET_REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'publishReport',
    args: [
      keccak256(stringToHex(projectName.trim().toLowerCase())),
      report.sourceHash,
      report.reportHash,
      report.score,
      '',
      report.scannerVersion,
    ],
  });
}
