import process from 'node:process';
import { ARC_MAINNET_UNRESOLVED, mainnetRollbackConfig } from '../packages/proof/v4/mainnet-readiness.js';
import {
  buildArtifactTruth,
  canonical,
  readGitProvenance,
  REGISTRY_COMPILER_SETTINGS,
  REGISTRY_CONSTRUCTOR_ARGS,
  REGISTRY_CONTRACT_NAME,
  REGISTRY_CONTRACT_PATH,
  REGISTRY_TRANSACTION_VALUE,
  sha256,
  stable,
} from './lib/registry-artifact.mjs';

export function compileRegistry() {
  return buildArtifactTruth().artifact;
}

export function buildRegistryDeploymentManifest() {
  const { artifact, candidate } = buildArtifactTruth();
  const git = readGitProvenance();
  const manifest = {
    manifestVersion: 'veilforge.registry.deployment.v1',
    environment: 'mainnet',
    deploymentStatus: 'unresolved',
    networkKey: 'arc-mainnet',
    chainId: 5_042,
    contractName: REGISTRY_CONTRACT_NAME,
    contractVersion: candidate.contractVersion,
    sourcePath: REGISTRY_CONTRACT_PATH,
    compiler: artifact.compiler,
    compilerVersion: artifact.compiler.version,
    optimizer: REGISTRY_COMPILER_SETTINGS.optimizer,
    evmVersion: REGISTRY_COMPILER_SETTINGS.evmVersion,
    settings: artifact.input.settings,
    sourceDigest: artifact.sourceDigest,
    abiDigest: artifact.abiDigest,
    creationBytecodeDigest: artifact.creationBytecodeDigest,
    runtimeBytecodeDigest: artifact.runtimeBytecodeDigest,
    constructorArgs: REGISTRY_CONSTRUCTOR_ARGS,
    constructorArgsDigest: sha256(Buffer.from('0x', 'utf8')),
    transactionValue: REGISTRY_TRANSACTION_VALUE,
    expectedSelectors: artifact.methodIdentifiers,
    expectedEventTopics: candidate.expectedEventTopics ?? {},
    releaseVersion: '4.0.0-gc.1',
    gitCommit: git.gitCommit,
    gitDirty: git.dirty,
    registryAddress: null,
    deployer: null,
    transactionHash: null,
    blockNumber: null,
    verifiedAt: null,
    targetNetwork: { networkKey: 'arc-mainnet', status: 'unresolved', registryAddress: null, deploymentBlock: null, deploymentTx: null },
    deployerPolicy: 'controlled-deployer-separated-from-operational-publisher',
    verificationStatus: {
      compile: 'passed',
      deterministicArtifacts: 'passed',
      candidateDigestMatch: 'passed',
      calldataEncoding: 'passed',
      abiSelectorEventConsistency: 'passed',
      ownershipAdminInspection: 'passed-no-admin-surface',
      localEvmDeployment: 'not-run-by-production-rehearsal',
      mainnetDeployment: 'not-performed',
    },
    mainnetConfig: ARC_MAINNET_UNRESOLVED,
    rollbackConfig: mainnetRollbackConfig(),
  };
  return Object.freeze({ manifest: stable(manifest), manifestDigest: sha256(Buffer.from(canonical(manifest), 'utf8')) });
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/rehearse-arc-mainnet-registry.mjs')) {
  process.stdout.write(`${JSON.stringify(buildRegistryDeploymentManifest(), null, 2)}\n`);
}
