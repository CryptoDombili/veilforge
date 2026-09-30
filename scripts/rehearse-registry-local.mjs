import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import process from 'node:process';
import { createBlock } from '@ethereumjs/block';
import { createCustomCommon, Hardfork, Mainnet } from '@ethereumjs/common';
import { createLegacyTx } from '@ethereumjs/tx';
import { bytesToHex, createAccount, createAddressFromPrivateKey, hexToBytes } from '@ethereumjs/util';
import { createVM, runTx } from '@ethereumjs/vm';
import { Interface } from 'ethers';
import {
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

export const LOCAL_REHEARSAL_CHAIN_ID = 31_337;
const GAS_LIMIT = 8_000_000n;
const GAS_PRICE = 10_000_000_000n;

function assertExecution(result, operation) {
  if (result.execResult.exceptionError) throw new Error(`Local EVM ${operation} failed.`);
  return result;
}

export async function runLocalRegistryRehearsal() {
  const { artifact } = buildArtifactTruth();
  const common = createCustomCommon({ chainId: LOCAL_REHEARSAL_CHAIN_ID, name: 'veilforge-local-ephemeral' }, Mainnet, { hardfork: Hardfork.Shanghai });
  const vm = await createVM({ common });
  const rehearsalBlock = createBlock({ header: { number: 1n, timestamp: 1n, gasLimit: 30_000_000n } }, { common, skipConsensusFormatValidation: true });
  const deployerKey = randomBytes(32);
  const secondPublisherKey = randomBytes(32);
  const readOnlyCallerKey = randomBytes(32);
  const deployerAddress = createAddressFromPrivateKey(deployerKey);
  const secondPublisherAddress = createAddressFromPrivateKey(secondPublisherKey);
  const readOnlyCallerAddress = createAddressFromPrivateKey(readOnlyCallerKey);
  await vm.stateManager.putAccount(deployerAddress, createAccount({ nonce: 0n, balance: 10n ** 21n }));
  await vm.stateManager.putAccount(secondPublisherAddress, createAccount({ nonce: 0n, balance: 10n ** 21n }));
  await vm.stateManager.putAccount(readOnlyCallerAddress, createAccount({ nonce: 0n, balance: 10n ** 21n }));

  const execute = async ({ key, nonce, to, data }) => {
    const tx = createLegacyTx({ nonce, gasLimit: GAS_LIMIT, gasPrice: GAS_PRICE, value: 0n, to, data: hexToBytes(data) }, { common }).sign(key);
    const result = assertExecution(await runTx(vm, { tx, block: rehearsalBlock }), 'transaction');
    return { tx, result };
  };
  const call = async ({ caller = readOnlyCallerAddress, to, data }) => {
    const result = assertExecution(await vm.evm.runCall({ caller, to, data: hexToBytes(data), gasLimit: GAS_LIMIT }), 'call');
    return bytesToHex(result.execResult.returnValue);
  };

  const deployment = await execute({ key: deployerKey, nonce: 0n, to: undefined, data: artifact.creationBytecode });
  assert.ok(deployment.result.receipt);
  const contractAddress = deployment.result.createdAddress;
  assert.ok(contractAddress);
  const runtimeBytecode = bytesToHex(await vm.stateManager.getCode(contractAddress));
  const runtimeBytecodeDigest = sha256(Buffer.from(runtimeBytecode.slice(2), 'hex'));
  assert.equal(runtimeBytecodeDigest, artifact.runtimeBytecodeDigest);

  const contractInterface = new Interface(artifact.abi);
  const registryVersionResult = await call({ to: contractAddress, data: contractInterface.encodeFunctionData('REGISTRY_VERSION') });
  const publisherScopedResult = await call({ to: contractAddress, data: contractInterface.encodeFunctionData('PUBLISHER_SCOPED') });
  assert.equal(contractInterface.decodeFunctionResult('REGISTRY_VERSION', registryVersionResult)[0], REGISTRY_CONTRACT_VERSION);
  assert.equal(contractInterface.decodeFunctionResult('PUBLISHER_SCOPED', publisherScopedResult)[0], true);

  const projectId = `0x${'11'.repeat(32)}`;
  const firstSourceHash = `0x${'22'.repeat(32)}`;
  const firstReportHash = `0x${'33'.repeat(32)}`;
  const overwriteReportHash = `0x${'44'.repeat(32)}`;
  const isolatedReportHash = `0x${'55'.repeat(32)}`;
  const firstData = contractInterface.encodeFunctionData('publishReport', [projectId, firstSourceHash, firstReportHash, 10, 'local-v1', 'ipfs://local-first']);
  const firstPublish = await execute({ key: deployerKey, nonce: 1n, to: contractAddress, data: firstData });
  const event = (firstPublish.result.execResult.logs ?? []).map(([, topics, data]) => {
    try { return contractInterface.parseLog({ topics: topics.map(bytesToHex), data: bytesToHex(data) }); } catch { return null; }
  }).find((entry) => entry?.name === 'ReportPublished');
  assert.ok(event);
  assert.equal(event.args.projectId, projectId);
  assert.equal(event.args.sourceHash, firstSourceHash);
  assert.equal(event.args.reportHash, firstReportHash);
  assert.equal(event.args.publisher.toLowerCase(), deployerAddress.toString().toLowerCase());

  const overwriteData = contractInterface.encodeFunctionData('publishReport', [projectId, firstSourceHash, overwriteReportHash, 20, 'local-v2', 'ipfs://local-overwrite']);
  await execute({ key: deployerKey, nonce: 2n, to: contractAddress, data: overwriteData });
  const overwrittenRaw = await call({ to: contractAddress, data: contractInterface.encodeFunctionData('getLatestReport', [projectId, deployerAddress.toString()]) });
  const overwritten = contractInterface.decodeFunctionResult('getLatestReport', overwrittenRaw)[0];
  assert.equal(overwritten.reportHash, overwriteReportHash);
  assert.equal(overwritten.publisher.toLowerCase(), deployerAddress.toString().toLowerCase());

  const isolatedData = contractInterface.encodeFunctionData('publishReport', [projectId, firstSourceHash, isolatedReportHash, 30, 'local-v3', 'ipfs://local-isolated']);
  await execute({ key: secondPublisherKey, nonce: 0n, to: contractAddress, data: isolatedData });
  const firstNamespaceRaw = await call({ to: contractAddress, data: contractInterface.encodeFunctionData('getLatestReport', [projectId, deployerAddress.toString()]) });
  const secondNamespaceRaw = await call({ to: contractAddress, data: contractInterface.encodeFunctionData('getLatestReport', [projectId, secondPublisherAddress.toString()]) });
  const firstNamespace = contractInterface.decodeFunctionResult('getLatestReport', firstNamespaceRaw)[0];
  const secondNamespace = contractInterface.decodeFunctionResult('getLatestReport', secondNamespaceRaw)[0];
  assert.equal(firstNamespace.reportHash, overwriteReportHash);
  assert.equal(secondNamespace.reportHash, isolatedReportHash);
  const firstHasReportRaw = await call({ to: contractAddress, data: contractInterface.encodeFunctionData('hasReport', [projectId, deployerAddress.toString()]) });
  const secondHasReportRaw = await call({ to: contractAddress, data: contractInterface.encodeFunctionData('hasReport', [projectId, secondPublisherAddress.toString()]) });
  assert.equal(contractInterface.decodeFunctionResult('hasReport', firstHasReportRaw)[0], true);
  assert.equal(contractInterface.decodeFunctionResult('hasReport', secondHasReportRaw)[0], true);

  const git = readGitProvenance();
  const manifest = stable({
    manifestVersion: 'veilforge.registry.deployment.v1',
    environment: 'local',
    networkKey: 'local-ephemeral-evm',
    chainId: LOCAL_REHEARSAL_CHAIN_ID,
    contractName: REGISTRY_CONTRACT_NAME,
    contractVersion: REGISTRY_CONTRACT_VERSION,
    compilerVersion: artifact.compiler.version,
    optimizer: REGISTRY_COMPILER_SETTINGS.optimizer,
    evmVersion: REGISTRY_COMPILER_SETTINGS.evmVersion,
    constructorArgs: REGISTRY_CONSTRUCTOR_ARGS,
    transactionValue: REGISTRY_TRANSACTION_VALUE,
    sourceDigest: artifact.sourceDigest,
    creationBytecodeDigest: artifact.creationBytecodeDigest,
    runtimeBytecodeDigest: artifact.runtimeBytecodeDigest,
    abiDigest: artifact.abiDigest,
    deployer: deployerAddress.toString(),
    transactionHash: bytesToHex(deployment.tx.hash()),
    contractAddress: contractAddress.toString(),
    blockNumber: 1,
    deploymentStatus: 'rehearsal',
    verifiedAt: new Date().toISOString(),
    gitCommit: git.gitCommit,
    gitDirty: git.dirty,
  });
  const checks = stable({
    artifactTruth: true,
    deploymentReceipt: true,
    runtimeBytecodeExactMatch: true,
    registryVersion: true,
    publisherScopedConstant: true,
    publishEvent: true,
    samePublisherOverwrite: true,
    publisherNamespaceIsolation: true,
  });
  deployerKey.fill(0);
  secondPublisherKey.fill(0);
  readOnlyCallerKey.fill(0);
  return Object.freeze({ manifest, checks });
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/rehearse-registry-local.mjs')) {
  runLocalRegistryRehearsal().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
    process.stderr.write(`LOCAL_REHEARSAL_FAILED: ${error?.message ?? 'Unknown local rehearsal failure.'}\n`);
    process.exitCode = 1;
  });
}
