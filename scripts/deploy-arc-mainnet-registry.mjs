import process from 'node:process';
import { JsonRpcProvider, Wallet } from 'ethers';
import {
  assertArtifactMatchesCandidate,
  buildArtifactTruth,
  readGitProvenance,
  REGISTRY_COMPILER_SETTINGS,
  REGISTRY_CONSTRUCTOR_ARGS,
  REGISTRY_CONTRACT_NAME,
  REGISTRY_CONTRACT_VERSION,
  REGISTRY_TRANSACTION_VALUE,
  sha256,
  stable,
} from './lib/registry-artifact.mjs';
import { redactSensitive, sanitizeRpcUrl } from './lib/rpc-safety.mjs';

export { redactSensitive, sanitizeRpcUrl } from './lib/rpc-safety.mjs';

export const ARC_MAINNET_DEPLOY_CHAIN_ID = 5_042;
export const ARC_MAINNET_DEPLOY_CHAIN_ID_HEX = '0x13b2';
export const BROADCAST_CONFIRMATION_ENV = 'VEILFORGE_ALLOW_MAINNET_DEPLOY';
export const BROADCAST_CONFIRMATION_VALUE = 'YES_I_UNDERSTAND_ARC_MAINNET_DEPLOY';
export const DEPLOYER_KEY_ENV = 'VEILFORGE_DEPLOYER_PRIVATE_KEY';
export const RPC_URL_ENV = 'VEILFORGE_ARC_MAINNET_RPC_URL';

function deploymentError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function parseDeploymentArgs(args = []) {
  const unknown = args.filter((arg) => arg !== '--broadcast');
  if (unknown.length) throw deploymentError('DEPLOY_ARGUMENT_INVALID', 'Only the --broadcast flag is supported. Secrets must not be passed as command-line arguments.');
  return Object.freeze({ broadcast: args.includes('--broadcast') });
}

export function assertArcMainnetChainId(value) {
  if (value == null || value === '') throw deploymentError('DEPLOY_CHAIN_ID_MISSING', 'Arc Mainnet chain ID is unavailable.');
  const normalized = typeof value === 'string' && /^0x[0-9a-f]+$/iu.test(value) ? Number.parseInt(value, 16) : Number(value);
  if (normalized !== ARC_MAINNET_DEPLOY_CHAIN_ID) throw deploymentError('DEPLOY_CHAIN_ID_MISMATCH', `Expected Arc Mainnet chain ${ARC_MAINNET_DEPLOY_CHAIN_ID}.`);
  return ARC_MAINNET_DEPLOY_CHAIN_ID;
}

export function assertBroadcastAuthorization({ broadcast, confirmation, git } = {}) {
  if (broadcast !== true) throw deploymentError('DEPLOY_BROADCAST_FLAG_REQUIRED', 'Broadcast requires the explicit --broadcast flag.');
  if (confirmation !== BROADCAST_CONFIRMATION_VALUE) throw deploymentError('DEPLOY_CONFIRMATION_REQUIRED', `Broadcast requires ${BROADCAST_CONFIRMATION_ENV}.`);
  if (!git?.gitCommit) throw deploymentError('DEPLOY_GIT_UNRESOLVED', 'Broadcast requires a resolved Git commit.');
  if (git.dirty !== false) throw deploymentError('DEPLOY_GIT_DIRTY', 'Broadcast requires a clean working tree.');
  return true;
}

export function buildRegistryCreationTransaction(artifact, { value = REGISTRY_TRANSACTION_VALUE, constructorArgs = REGISTRY_CONSTRUCTOR_ARGS } = {}) {
  if (!Array.isArray(constructorArgs) || constructorArgs.length !== 0) throw deploymentError('DEPLOY_CONSTRUCTOR_ARGS_INVALID', 'VeilForgeReportRegistry accepts no constructor arguments.');
  if (value !== '0x0' && value !== 0 && value !== 0n) throw deploymentError('DEPLOY_VALUE_NONZERO', 'Registry deployment transaction value must be zero.');
  return Object.freeze({ to: null, value: 0n, data: artifact.creationBytecode });
}

export function assertRegistryCreationTransaction(transaction, artifact) {
  if (!transaction || transaction.to !== null) throw deploymentError('DEPLOY_TARGET_INVALID', 'Registry deployment must be a contract-creation transaction.');
  if (transaction.value !== 0n && transaction.value !== 0 && transaction.value !== '0x0') throw deploymentError('DEPLOY_VALUE_NONZERO', 'Registry deployment transaction value must be zero.');
  if (transaction.data !== artifact.creationBytecode) throw deploymentError('DEPLOY_BYTECODE_MISMATCH', 'Registry deployment bytecode does not match the trusted production candidate.');
  return true;
}

export function buildProductionDryRunPlan({ artifact, candidate, git = readGitProvenance(), deployer = null, rpcEndpoint = null } = {}) {
  assertArtifactMatchesCandidate(artifact, candidate);
  return stable({
    mode: 'DRY RUN',
    networkExpected: 'Arc Mainnet',
    networkKey: 'arc-mainnet',
    expectedChainId: ARC_MAINNET_DEPLOY_CHAIN_ID,
    contractName: REGISTRY_CONTRACT_NAME,
    contractVersion: REGISTRY_CONTRACT_VERSION,
    compilerVersion: artifact.compiler.version,
    optimizer: REGISTRY_COMPILER_SETTINGS.optimizer,
    evmTarget: REGISTRY_COMPILER_SETTINGS.evmVersion,
    constructorArgs: REGISTRY_CONSTRUCTOR_ARGS,
    transactionValue: REGISTRY_TRANSACTION_VALUE,
    sourceDigest: artifact.sourceDigest,
    creationBytecodeDigest: artifact.creationBytecodeDigest,
    expectedRuntimeBytecodeDigest: artifact.runtimeBytecodeDigest,
    abiDigest: artifact.abiDigest,
    deployerPublicAddress: deployer ?? 'UNRESOLVED / NOT QUERIED',
    rpcEndpoint: rpcEndpoint ? sanitizeRpcUrl(rpcEndpoint) : 'UNRESOLVED / NOT QUERIED',
    estimatedGas: 'UNRESOLVED / NOT QUERIED',
    estimatedFee: 'UNRESOLVED / NOT QUERIED',
    gitCommit: git.gitCommit,
    gitDirty: git.dirty,
    broadcast: false,
  });
}

export async function broadcastRegistryDeployment({ rpcRequest, signer, artifact, candidate, transaction, git, confirmation } = {}) {
  assertBroadcastAuthorization({ broadcast: true, confirmation, git });
  assertArtifactMatchesCandidate(artifact, candidate);
  assertRegistryCreationTransaction(transaction, artifact);
  if (typeof rpcRequest !== 'function') throw deploymentError('DEPLOY_RPC_UNAVAILABLE', 'A bounded RPC request function is required.');
  if (!signer?.sendTransaction) throw deploymentError('DEPLOY_SIGNER_UNAVAILABLE', 'A deployment signer is required.');
  assertArcMainnetChainId(await rpcRequest('eth_chainId', []));
  assertRegistryCreationTransaction(transaction, artifact);
  return signer.sendTransaction(transaction);
}

async function rawRpcRequest(rpcUrl, method, params = []) {
  let response;
  try {
    response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
  } catch {
    throw deploymentError('DEPLOY_RPC_UNAVAILABLE', 'Arc Mainnet RPC request failed.');
  }
  if (!response.ok) throw deploymentError('DEPLOY_RPC_UNAVAILABLE', 'Arc Mainnet RPC request failed.');
  const body = await response.json();
  if (body?.error || !Object.hasOwn(body ?? {}, 'result')) throw deploymentError('DEPLOY_RPC_UNAVAILABLE', 'Arc Mainnet RPC returned an invalid response.');
  return body.result;
}

function requireSecretEnvironment(env) {
  const privateKey = env[DEPLOYER_KEY_ENV];
  const rpcUrl = env[RPC_URL_ENV];
  if (!/^0x[0-9a-fA-F]{64}$/u.test(String(privateKey ?? ''))) throw deploymentError('DEPLOY_SIGNER_UNAVAILABLE', `A valid ${DEPLOYER_KEY_ENV} environment value is required.`);
  try {
    const parsed = new URL(String(rpcUrl));
    if (parsed.protocol !== 'https:') throw new Error('protocol');
  } catch {
    throw deploymentError('DEPLOY_RPC_UNAVAILABLE', `A valid HTTPS ${RPC_URL_ENV} environment value is required.`);
  }
  return { privateKey, rpcUrl };
}

export async function runProductionDeployment({ args = [], env = process.env, stdout = process.stdout } = {}) {
  const flags = parseDeploymentArgs(args);
  const { artifact, candidate } = buildArtifactTruth();
  const git = readGitProvenance();
  const dryRunPlan = buildProductionDryRunPlan({ artifact, candidate, git });
  if (!flags.broadcast) {
    stdout.write(`${JSON.stringify(dryRunPlan, null, 2)}\n`);
    return Object.freeze({ plan: dryRunPlan, manifest: null, broadcast: false });
  }

  assertBroadcastAuthorization({ broadcast: true, confirmation: env[BROADCAST_CONFIRMATION_ENV], git });
  const { privateKey, rpcUrl } = requireSecretEnvironment(env);
  assertArcMainnetChainId(await rawRpcRequest(rpcUrl, 'eth_chainId', []));

  const provider = new JsonRpcProvider(rpcUrl);
  assertArcMainnetChainId(await provider.send('eth_chainId', []));
  const signer = new Wallet(privateKey, provider);
  const deployer = await signer.getAddress();
  const transaction = buildRegistryCreationTransaction(artifact);
  const gasEstimate = await provider.estimateGas({ ...transaction, from: deployer });
  const feeData = await provider.getFeeData();
  const plan = Object.freeze({
    ...buildProductionDryRunPlan({ artifact, candidate, git, deployer, rpcEndpoint: rpcUrl }),
    mode: 'BROADCAST ARMED',
    estimatedGas: gasEstimate.toString(),
    estimatedFee: feeData.maxFeePerGas == null ? 'UNRESOLVED / NOT QUERIED' : feeData.maxFeePerGas.toString(),
    broadcast: true,
  });
  stdout.write(`${JSON.stringify(plan, null, 2)}\n`);

  const sent = await broadcastRegistryDeployment({
    rpcRequest: (method, params) => provider.send(method, params), signer, artifact, candidate, transaction, git,
    confirmation: env[BROADCAST_CONFIRMATION_ENV],
  });
  const receipt = await sent.wait();
  if (!receipt?.contractAddress) throw deploymentError('DEPLOY_RECEIPT_INVALID', 'Deployment receipt did not contain a contract address.');
  const runtimeBytecode = await provider.getCode(receipt.contractAddress);
  const runtimeDigest = sha256(Buffer.from(runtimeBytecode.slice(2), 'hex'));
  if (runtimeDigest !== artifact.runtimeBytecodeDigest) throw deploymentError('DEPLOY_RUNTIME_MISMATCH', 'Deployed runtime bytecode does not match the trusted production candidate.');
  const manifest = stable({
    manifestVersion: 'veilforge.registry.deployment.v1', environment: 'mainnet', networkKey: 'arc-mainnet', chainId: ARC_MAINNET_DEPLOY_CHAIN_ID,
    contractName: REGISTRY_CONTRACT_NAME, contractVersion: REGISTRY_CONTRACT_VERSION, compilerVersion: artifact.compiler.version,
    optimizer: REGISTRY_COMPILER_SETTINGS.optimizer, evmVersion: REGISTRY_COMPILER_SETTINGS.evmVersion,
    constructorArgs: REGISTRY_CONSTRUCTOR_ARGS, transactionValue: REGISTRY_TRANSACTION_VALUE,
    sourceDigest: artifact.sourceDigest, creationBytecodeDigest: artifact.creationBytecodeDigest,
    runtimeBytecodeDigest: artifact.runtimeBytecodeDigest, abiDigest: artifact.abiDigest,
    deployer, transactionHash: receipt.hash, contractAddress: receipt.contractAddress, blockNumber: receipt.blockNumber,
    deploymentStatus: 'deployed', verifiedAt: null, gitCommit: git.gitCommit, gitDirty: git.dirty,
  });
  stdout.write(`${JSON.stringify({ manifest }, null, 2)}\n`);
  return Object.freeze({ plan, manifest, broadcast: true });
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/deploy-arc-mainnet-registry.mjs')) {
  runProductionDeployment({ args: process.argv.slice(2) }).catch((error) => {
    const secrets = [process.env[DEPLOYER_KEY_ENV], process.env[RPC_URL_ENV]];
    process.stderr.write(`${redactSensitive(`${error?.code ?? 'DEPLOY_FAILED'}: ${error?.message ?? 'Deployment failed.'}`, secrets)}\n`);
    process.exitCode = 1;
  });
}
