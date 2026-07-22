export const ARC_TESTNET = {
  id: 5_042_002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrl: 'https://rpc.testnet.arc.network',
  explorerUrl: 'https://testnet.arcscan.app',
  faucetUrl: 'https://faucet.circle.com',
} as const;
export const ARC_TESTNET_REGISTRY_ADDRESS = '0xf8b1D03931f2c11B642259d9aB19cfA3351C0Bbc' as const;

export const REGISTRY_ABI = [
  {
    type: 'function',
    name: 'publishReport',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'projectId', type: 'bytes32' },
      { name: 'sourceHash', type: 'bytes32' },
      { name: 'reportHash', type: 'bytes32' },
      { name: 'score', type: 'uint16' },
      { name: 'reportURI', type: 'string' },
      { name: 'scannerVersion', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'latestReport',
    stateMutability: 'view',
    inputs: [{ name: 'projectId', type: 'bytes32' }],
    outputs: [
      { name: 'sourceHash', type: 'bytes32' },
      { name: 'reportHash', type: 'bytes32' },
      { name: 'score', type: 'uint16' },
      { name: 'reportURI', type: 'string' },
      { name: 'submitter', type: 'address' },
      { name: 'timestamp', type: 'uint64' },
      { name: 'scannerVersion', type: 'string' },
    ],
  },
  {
    type: 'event',
    name: 'ReportPublished',
    anonymous: false,
    inputs: [
      { name: 'projectId', type: 'bytes32', indexed: true },
      { name: 'submitter', type: 'address', indexed: true },
      { name: 'sourceHash', type: 'bytes32', indexed: false },
      { name: 'reportHash', type: 'bytes32', indexed: false },
      { name: 'score', type: 'uint16', indexed: false },
      { name: 'reportURI', type: 'string', indexed: false },
      { name: 'scannerVersion', type: 'string', indexed: false },
      { name: 'timestamp', type: 'uint64', indexed: false },
    ],
  },
] as const;
