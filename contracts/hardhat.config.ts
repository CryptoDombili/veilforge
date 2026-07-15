import '@nomicfoundation/hardhat-toolbox';
import 'dotenv/config';
import type { HardhatUserConfig } from 'hardhat/config';

const privateKey = process.env.ARC_PRIVATE_KEY;
const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: false,
    },
  },
  networks: {
    arcTestnet: {
      url: process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.network',
      chainId: 5_042_002,
      accounts: privateKey ? [privateKey] : [],
    },
  },
};

export default config;
