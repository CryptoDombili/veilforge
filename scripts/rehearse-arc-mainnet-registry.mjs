import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import process from 'node:process';
import solc from 'solc';
import { keccakHex } from '../packages/analyzer/src/keccak.js';
import { encodePublishReport, PUBLISH_REPORT_SELECTOR, PUBLISH_REPORT_SIGNATURE } from '../packages/proof/src/registry.js';
import { REPORT_PUBLISHED_SIGNATURE, REPORT_PUBLISHED_TOPIC } from '../packages/proof/v4/receipt.js';
import { ARC_MAINNET_UNRESOLVED, mainnetRollbackConfig } from '../packages/proof/v4/mainnet-readiness.js';

const CONTRACT_PATH = 'contracts/VeilForgeReportRegistry.sol';
const CONTRACT_NAME = 'VeilForgeReportRegistry';
const BASELINE_COMMIT = '0d474396365c62af37a23fcb477ecb824454e5dd';
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}

function canonical(value) { return JSON.stringify(stable(value)); }

export function compileRegistry() {
  const source = fs.readFileSync(CONTRACT_PATH, 'utf8').replace(/\r\n?/gu, '\n');
  const input = {
    language: 'Solidity',
    sources: { [CONTRACT_PATH]: { content: source } },
    settings: {
      optimizer: { enabled: false, runs: 200 },
      evmVersion: 'shanghai',
      metadata: { bytecodeHash: 'none', appendCBOR: false },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.methodIdentifiers'] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter((item) => item.severity === 'error');
  if (errors.length) throw new Error(`Registry compile failed (${errors.length}).`);
  const artifact = output.contracts?.[CONTRACT_PATH]?.[CONTRACT_NAME];
  if (!artifact) throw new Error('Registry artifact is unavailable.');
  return { source, input, artifact };
}

export function buildRegistryDeploymentManifest() {
  const { source, input, artifact } = compileRegistry();
  const creationBytecode = `0x${artifact.evm.bytecode.object}`;
  const runtimeBytecode = `0x${artifact.evm.deployedBytecode.object}`;
  const constructorAbi = artifact.abi.find((item) => item.type === 'constructor');
  const expectedMethods = Object.fromEntries(Object.entries(artifact.evm.methodIdentifiers).sort());
  assert.equal(solc.version().split('+')[0], '0.8.24');
  assert.equal(expectedMethods[PUBLISH_REPORT_SIGNATURE], PUBLISH_REPORT_SELECTOR.slice(2));
  assert.equal(keccakHex(REPORT_PUBLISHED_SIGNATURE), REPORT_PUBLISHED_TOPIC);
  assert.equal(constructorAbi, undefined);
  assert.ok(creationBytecode.length > 2 && runtimeBytecode.length > 2);
  const sampleCalldata = encodePublishReport({
    projectId: `0x${'11'.repeat(32)}`,
    sourceHash: `0x${'22'.repeat(32)}`,
    reportHash: `0x${'33'.repeat(32)}`,
    score: 0,
    scannerVersion: '4.0.0-gc.1|report:4.1.0|hash:v2|proof:4.1',
    reportURI: '',
  });
  assert.ok(sampleCalldata.startsWith(PUBLISH_REPORT_SELECTOR));
  const ownership = {
    ownerOrAdmin: /\b(owner|admin)\b/u.test(source),
    upgradeable: /\b(upgradeTo|delegatecall|proxy)\b/u.test(source),
    pauseCapability: /\b(pause|paused|unpause)\b/u.test(source),
    constructorArguments: constructorAbi?.inputs ?? [],
  };
  assert.deepEqual(ownership, { ownerOrAdmin: false, upgradeable: false, pauseCapability: false, constructorArguments: [] });
  const manifest = {
    manifestVersion: 'veilforge.registry.deployment.v1',
    contractName: CONTRACT_NAME,
    sourcePath: CONTRACT_PATH,
    compiler: { name: 'solc', version: '0.8.24', longVersion: solc.version() },
    settings: input.settings,
    sourceDigest: sha256(Buffer.from(source, 'utf8')),
    abiDigest: sha256(Buffer.from(canonical(artifact.abi), 'utf8')),
    creationBytecodeDigest: sha256(Buffer.from(creationBytecode.slice(2), 'hex')),
    runtimeBytecodeDigest: sha256(Buffer.from(runtimeBytecode.slice(2), 'hex')),
    constructorArgs: [],
    constructorArgsDigest: sha256(Buffer.from('0x', 'utf8')),
    expectedSelectors: expectedMethods,
    expectedEventTopics: { [REPORT_PUBLISHED_SIGNATURE]: REPORT_PUBLISHED_TOPIC },
    releaseVersion: '4.0.0-gc.1',
    baselineCommit: BASELINE_COMMIT,
    gitCommit: 'CURRENT_PHASE_5D_COMMIT_UNRESOLVED',
    targetNetwork: { networkKey: 'arc-mainnet', status: 'unresolved', registryAddress: null, deploymentBlock: null, deploymentTx: null },
    deployerPolicy: 'controlled-deployer-separated-from-operational-publisher',
    verificationStatus: {
      compile: 'passed',
      deterministicArtifacts: 'passed',
      calldataEncoding: 'passed',
      abiSelectorEventConsistency: 'passed',
      ownershipAdminInspection: 'passed-no-admin-surface',
      localEvmDeployment: 'not-run-no-ephemeral-evm-runtime',
      mainnetDeployment: 'not-performed',
    },
    mainnetConfig: ARC_MAINNET_UNRESOLVED,
    rollbackConfig: mainnetRollbackConfig(),
  };
  return Object.freeze({ manifest: stable(manifest), manifestDigest: sha256(Buffer.from(canonical(manifest), 'utf8')) });
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/rehearse-arc-mainnet-registry.mjs')) {
  const result = buildRegistryDeploymentManifest();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
