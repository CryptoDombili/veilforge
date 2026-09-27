import process from 'node:process';
import {
  assertArtifactMatchesCandidate,
  buildArtifactTruth,
  readGitProvenance,
  REGISTRY_CONSTRUCTOR_ARGS,
  REGISTRY_TRANSACTION_VALUE,
  stable,
} from './lib/registry-artifact.mjs';
import {
  createReadOnlyRpcClient,
  redactSensitive,
  sanitizeRpcUrl,
} from './lib/rpc-safety.mjs';
import {
  ARC_MAINNET_REGISTRY_ADDRESS,
  ARC_MAINNET_REGISTRY_DEPLOYMENT_BLOCK,
  ARC_MAINNET_REGISTRY_DEPLOYMENT_TX,
  ARC_MAINNET_REGISTRY_RUNTIME_DIGEST,
  ARC_TESTNET_REGISTRY_ADDRESS,
  PROOF_NETWORKS,
} from '../packages/proof/v4/network.js';

export const ARC_MAINNET_PREFLIGHT_NETWORK_KEY = 'arc-mainnet';
export const ARC_MAINNET_PREFLIGHT_CHAIN_ID = 5_042;
export const ARC_MAINNET_PREFLIGHT_CHAIN_ID_HEX = '0x13b2';
export const ARC_TESTNET_CHAIN_ID = 5_042_002;
export const ARC_MAINNET_RPC_ENDPOINT = 'https://rpc.mainnet.arc.io';
export const ARC_MAINNET_EXPLORER = 'https://explorer.arc.io';
export const ARC_MAINNET_NATIVE_ASSET = Object.freeze({ name: 'USDC', symbol: 'USDC', decimals: 18 });
export const PREFLIGHT_RPC_URL_ENV = 'VEILFORGE_ARC_MAINNET_RPC_URL';
export const PUBLIC_DEPLOYER_ADDRESS_ENV = 'VEILFORGE_DEPLOYER_ADDRESS';
export const LOCAL_REHEARSAL_ADDRESS = '0xc3588a3a95067cf2d641abe21537cba4f9e8ae99';

const UNRESOLVED = 'UNRESOLVED';

function preflightError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function parsePreflightArgs(args = []) {
  if (args.length !== 0) throw preflightError('PREFLIGHT_ARGUMENT_INVALID', 'The read-only preflight accepts no command-line arguments or secrets.');
  return Object.freeze({ readOnly: true });
}

export function assertArcMainnetPreflightChainId(value) {
  if (value === '0x4cef52' || value === ARC_TESTNET_CHAIN_ID || value === String(ARC_TESTNET_CHAIN_ID)) {
    throw preflightError('PREFLIGHT_TESTNET_CHAIN_REJECTED', 'Arc Testnet chain 5042002 is not Arc Mainnet.');
  }
  if (value !== ARC_MAINNET_PREFLIGHT_CHAIN_ID_HEX) {
    throw preflightError('PREFLIGHT_CHAIN_ID_MISMATCH', `Expected exact Arc Mainnet chain ID ${ARC_MAINNET_PREFLIGHT_CHAIN_ID_HEX} (${ARC_MAINNET_PREFLIGHT_CHAIN_ID}).`);
  }
  return ARC_MAINNET_PREFLIGHT_CHAIN_ID;
}

export function parseRpcQuantity(value, field) {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/u.test(value)) {
    throw preflightError('PREFLIGHT_RPC_QUANTITY_INVALID', `${field} is not a canonical hexadecimal RPC quantity.`);
  }
  return BigInt(value);
}

export function normalizePublicDeployerAddress(value) {
  if (value == null || String(value).trim() === '') return null;
  const address = String(value).trim();
  if (!/^0x[0-9a-fA-F]{40}$/u.test(address) || /^0x0{40}$/iu.test(address)) {
    throw preflightError('PREFLIGHT_DEPLOYER_ADDRESS_INVALID', `${PUBLIC_DEPLOYER_ADDRESS_ENV} must contain a non-zero public EVM address.`);
  }
  return address;
}

export function assertMainnetRuntimeFailClosed() {
  const mainnet = PROOF_NETWORKS[ARC_MAINNET_PREFLIGHT_NETWORK_KEY];
  const state = stable({
    chainId: mainnet.chainId,
    registryAddress: mainnet.registryAddress,
    enabled: mainnet.enabled,
    proofReadEnabled: mainnet.proofReadEnabled,
    publishEnabled: mainnet.publishEnabled,
    deploymentStatus: mainnet.deploymentStatus,
    registryRuntimeBytecodeDigest: mainnet.registryRuntimeBytecodeDigest,
    registryDeploymentTransaction: mainnet.registryDeploymentTransaction,
    registryDeploymentBlock: mainnet.registryDeploymentBlock,
  });
  const expected = stable({
    chainId: ARC_MAINNET_PREFLIGHT_CHAIN_ID,
    registryAddress: ARC_MAINNET_REGISTRY_ADDRESS,
    enabled: true,
    proofReadEnabled: true,
    publishEnabled: true,
    deploymentStatus: 'verified',
    registryRuntimeBytecodeDigest: ARC_MAINNET_REGISTRY_RUNTIME_DIGEST,
    registryDeploymentTransaction: ARC_MAINNET_REGISTRY_DEPLOYMENT_TX,
    registryDeploymentBlock: ARC_MAINNET_REGISTRY_DEPLOYMENT_BLOCK,
  });
  if (JSON.stringify(state) !== JSON.stringify(expected)) throw preflightError('PREFLIGHT_MAINNET_CONFIG_UNSAFE', 'Arc Mainnet runtime config is not the verified production profile.');
  if (mainnet.registryAddress === ARC_TESTNET_REGISTRY_ADDRESS || mainnet.registryAddress === LOCAL_REHEARSAL_ADDRESS) {
    throw preflightError('PREFLIGHT_MAINNET_REGISTRY_INVALID', 'Arc Mainnet must not use a Testnet or local rehearsal Registry address.');
  }
  return state;
}

export function verifyPreflightArtifact(artifact, candidate) {
  assertArtifactMatchesCandidate(artifact, candidate);
  return Object.freeze({
    creationBytecodeDigest: artifact.creationBytecodeDigest,
    runtimeBytecodeDigest: artifact.runtimeBytecodeDigest,
    abiDigest: artifact.abiDigest,
    sourceDigest: artifact.sourceDigest,
  });
}

export function buildPreflightCreationRequest(artifact, { from = null } = {}) {
  const request = { data: artifact.creationBytecode, value: REGISTRY_TRANSACTION_VALUE };
  if (from) request.from = normalizePublicDeployerAddress(from);
  return Object.freeze(request);
}

export function assertPreflightCreationRequest(request, artifact, { deployer = null } = {}) {
  if (!request || Object.hasOwn(request, 'to')) throw preflightError('PREFLIGHT_DEPLOYMENT_TARGET_INVALID', 'Preflight gas estimation must be contract creation with no target.');
  if (request.value !== '0x0') throw preflightError('PREFLIGHT_DEPLOYMENT_VALUE_NONZERO', 'Registry deployment value must be zero.');
  if (request.data !== artifact.creationBytecode) throw preflightError('PREFLIGHT_DEPLOYMENT_BYTECODE_MISMATCH', 'Gas estimation data must be the exact trusted creation bytecode.');
  if (REGISTRY_CONSTRUCTOR_ARGS.length !== 0) throw preflightError('PREFLIGHT_CONSTRUCTOR_ARGS_INVALID', 'Registry constructor arguments must remain empty.');
  if (deployer && request.from !== deployer) throw preflightError('PREFLIGHT_DEPLOYER_MISMATCH', 'Gas estimation must use only the supplied public deployer address.');
  return true;
}

function formatUnits(value, decimals = ARC_MAINNET_NATIVE_ASSET.decimals) {
  const amount = BigInt(value);
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = (amount % divisor).toString().padStart(decimals, '0').replace(/0+$/u, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function parseBlock(block, expectedNumber) {
  if (!block || typeof block !== 'object') throw preflightError('PREFLIGHT_BLOCK_INVALID', 'Latest Arc Mainnet block is unavailable.');
  const number = parseRpcQuantity(block.number, 'Latest block number');
  if (number !== expectedNumber) throw preflightError('PREFLIGHT_BLOCK_MISMATCH', 'Latest block response does not match eth_blockNumber.');
  if (!/^0x[0-9a-fA-F]{64}$/u.test(String(block.hash ?? ''))) throw preflightError('PREFLIGHT_BLOCK_INVALID', 'Latest block hash is invalid.');
  const timestamp = parseRpcQuantity(block.timestamp, 'Latest block timestamp');
  const baseFeePerGas = block.baseFeePerGas == null ? null : parseRpcQuantity(block.baseFeePerGas, 'Latest block base fee');
  return Object.freeze({ number, hash: block.hash, timestamp, baseFeePerGas });
}

export async function checkExplorerAvailability({ fetchImpl = globalThis.fetch, endpoint = ARC_MAINNET_EXPLORER, timeoutMs = 15_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, { method: 'GET', redirect: 'follow', signal: controller.signal });
    return Object.freeze({ endpoint: sanitizeRpcUrl(endpoint), available: Boolean(response?.ok), httpStatus: response?.status ?? null });
  } catch {
    return Object.freeze({ endpoint: sanitizeRpcUrl(endpoint), available: false, httpStatus: null });
  } finally {
    clearTimeout(timer);
  }
}

export async function runArcMainnetPreflight({
  args = [],
  env = process.env,
  fetchImpl = globalThis.fetch,
  explorerFetchImpl = globalThis.fetch,
  stdout = process.stdout,
  git = readGitProvenance(),
} = {}) {
  parsePreflightArgs(args);
  const initialRuntimeState = assertMainnetRuntimeFailClosed();
  const { artifact, candidate } = buildArtifactTruth();
  verifyPreflightArtifact(artifact, candidate);
  const rpcEndpoint = env[PREFLIGHT_RPC_URL_ENV] || ARC_MAINNET_RPC_ENDPOINT;
  const deployerAddress = normalizePublicDeployerAddress(env[PUBLIC_DEPLOYER_ADDRESS_ENV]);
  const rpc = createReadOnlyRpcClient({ endpoint: rpcEndpoint, fetchImpl });

  const chainIdHex = await rpc.request('eth_chainId', []);
  const chainId = assertArcMainnetPreflightChainId(chainIdHex);
  const latestBlockNumberRaw = await rpc.request('eth_blockNumber', []);
  const latestBlockNumber = parseRpcQuantity(latestBlockNumberRaw, 'Latest block number');
  const latestBlock = parseBlock(await rpc.request('eth_getBlockByNumber', [latestBlockNumberRaw, false]), latestBlockNumber);
  const gasPrice = parseRpcQuantity(await rpc.request('eth_gasPrice', []), 'Gas price');

  let deployerBalance = UNRESOLVED;
  let gasEstimate = UNRESOLVED;
  let estimatedFee = UNRESOLVED;
  let balanceBaseUnits = null;
  let gasEstimateUnits = null;
  if (deployerAddress) {
    balanceBaseUnits = parseRpcQuantity(await rpc.request('eth_getBalance', [deployerAddress, 'latest']), 'Deployer balance');
    deployerBalance = Object.freeze({
      baseUnits: balanceBaseUnits.toString(),
      formatted: `${formatUnits(balanceBaseUnits)} ${ARC_MAINNET_NATIVE_ASSET.symbol}`,
    });
    const transaction = buildPreflightCreationRequest(artifact, { from: deployerAddress });
    assertPreflightCreationRequest(transaction, artifact, { deployer: deployerAddress });
    gasEstimateUnits = parseRpcQuantity(await rpc.request('eth_estimateGas', [transaction]), 'Gas estimate');
    gasEstimate = gasEstimateUnits.toString();
    const estimatedFeeBaseUnits = gasEstimateUnits * gasPrice;
    estimatedFee = Object.freeze({
      basis: 'gasEstimate × current eth_gasPrice; approximate preflight value',
      baseUnits: estimatedFeeBaseUnits.toString(),
      formatted: `${formatUnits(estimatedFeeBaseUnits)} ${ARC_MAINNET_NATIVE_ASSET.symbol}`,
    });
  }

  const explorer = await checkExplorerAvailability({ fetchImpl: explorerFetchImpl });
  const finalRuntimeState = assertMainnetRuntimeFailClosed();
  if (JSON.stringify(initialRuntimeState) !== JSON.stringify(finalRuntimeState)) throw preflightError('PREFLIGHT_MAINNET_CONFIG_MUTATED', 'Read-only preflight changed Arc Mainnet runtime config.');

  const blockers = [];
  if (!git.gitCommit) blockers.push('Git commit is unresolved.');
  if (git.dirty !== false) blockers.push('Working tree is dirty; production broadcast requires a clean reviewed commit.');
  if (!deployerAddress) blockers.push(`${PUBLIC_DEPLOYER_ADDRESS_ENV} is unresolved; balance and gas estimate were not queried.`);
  if (deployerAddress && gasEstimateUnits == null) blockers.push('Deployment gas estimate is unresolved.');
  if (deployerAddress && balanceBaseUnits != null && estimatedFee !== UNRESOLVED && balanceBaseUnits < BigInt(estimatedFee.baseUnits)) blockers.push('Public deployer balance is below the approximate deployment fee.');

  const usage = rpc.usage();
  const result = stable({
    mode: 'READ ONLY',
    networkKey: ARC_MAINNET_PREFLIGHT_NETWORK_KEY,
    chainIdHex,
    chainId,
    rpcEndpoint: rpc.sanitizedEndpoint,
    latestBlockNumber: latestBlock.number.toString(),
    latestBlockHash: latestBlock.hash,
    latestBlockTimestamp: latestBlock.timestamp.toString(),
    latestBlockTimestampIso: new Date(Number(latestBlock.timestamp) * 1_000).toISOString(),
    explorer,
    nativeFeeAsset: ARC_MAINNET_NATIVE_ASSET,
    artifactDigests: {
      creationBytecode: artifact.creationBytecodeDigest,
      runtimeBytecode: artifact.runtimeBytecodeDigest,
      abi: artifact.abiDigest,
      source: artifact.sourceDigest,
    },
    artifactCandidateVerified: true,
    candidateManifestVersion: candidate.manifestVersion,
    gitCommit: git.gitCommit,
    gitDirty: git.dirty,
    deployerAddress: deployerAddress ?? UNRESOLVED,
    deployerBalance,
    gasEstimate: deployerAddress ? gasEstimate : 'UNRESOLVED — public deployer address required',
    feePerGas: {
      ethGasPriceBaseUnits: gasPrice.toString(),
      latestBlockBaseFeePerGasBaseUnits: latestBlock.baseFeePerGas?.toString() ?? UNRESOLVED,
    },
    estimatedDeploymentFee: deployerAddress ? estimatedFee : 'UNRESOLVED — gas estimate requires public deployer address',
    rpcMethods: usage.methods,
    forbiddenRpcCallCount: usage.forbiddenCallCount,
    runtimeState: finalRuntimeState,
    transactionCount: 0,
    walletSigningCount: 0,
    productionDeploymentReady: blockers.length === 0,
    productionDeploymentBlockers: blockers,
  });
  stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return Object.freeze(result);
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/preflight-arc-mainnet-registry.mjs')) {
  runArcMainnetPreflight({ args: process.argv.slice(2) }).catch((error) => {
    const secrets = [process.env[PREFLIGHT_RPC_URL_ENV]];
    process.stderr.write(`${redactSensitive(`${error?.code ?? 'PREFLIGHT_FAILED'}: ${error?.message ?? 'Read-only preflight failed.'}`, secrets)}\n`);
    process.exitCode = 1;
  });
}
