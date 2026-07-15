import { ethers, network } from 'hardhat';

async function main(): Promise<void> {
  if (network.config.chainId !== 5_042_002) {
    throw new Error(`Refusing deployment: expected Arc Testnet chain ID 5042002, got ${network.config.chainId ?? 'unknown'}`);
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error('No deployer configured. Set ARC_PRIVATE_KEY in contracts/.env.');

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deploying from ${deployer.address}`);
  console.log(`Native USDC gas balance: ${ethers.formatEther(balance)}`);

  const factory = await ethers.getContractFactory('VeilForgeReportRegistry');
  const registry = await factory.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  const transaction = registry.deploymentTransaction();
  console.log(`VeilForgeReportRegistry: ${address}`);
  if (transaction) {
    console.log(`ArcScan: https://testnet.arcscan.app/tx/${transaction.hash}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
