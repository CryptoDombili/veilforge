import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';
import { keccakHex } from '../../packages/analyzer/src/keccak.js';
import { encodePublishReport, PUBLISH_REPORT_SELECTOR, PUBLISH_REPORT_SIGNATURE } from '../../packages/proof/src/registry.js';
import { REPORT_PUBLISHED_SIGNATURE, REPORT_PUBLISHED_TOPIC } from '../../packages/proof/v4/receipt.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REGISTRY_CONTRACT_PATH = 'contracts/VeilForgeReportRegistry.sol';
export const REGISTRY_CONTRACT_NAME = 'VeilForgeReportRegistry';
export const REGISTRY_CONTRACT_VERSION = '2.0.0';
export const REGISTRY_COMPILER_VERSION = '0.8.24';
export const REGISTRY_CONSTRUCTOR_ARGS = Object.freeze([]);
export const REGISTRY_TRANSACTION_VALUE = '0x0';

export const REGISTRY_COMPILER_SETTINGS = Object.freeze({
  optimizer: Object.freeze({ enabled: false, runs: 200 }),
  evmVersion: 'shanghai',
  metadata: Object.freeze({ bytecodeHash: 'none', appendCBOR: false }),
  outputSelection: Object.freeze({ '*': Object.freeze({ '*': Object.freeze(['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.methodIdentifiers']) }) }),
});

export function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)]));
  return value;
}

export function canonical(value) {
  return JSON.stringify(stable(value));
}

export function readGitProvenance(root = ROOT) {
  try {
    const gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return Object.freeze({ gitCommit, dirty: status.trim().length > 0 });
  } catch {
    return Object.freeze({ gitCommit: null, dirty: null });
  }
}

export function compileRegistryArtifact({ root = ROOT } = {}) {
  const sourcePath = path.join(root, REGISTRY_CONTRACT_PATH);
  const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n?/gu, '\n');
  const input = {
    language: 'Solidity',
    sources: { [REGISTRY_CONTRACT_PATH]: { content: source } },
    settings: REGISTRY_COMPILER_SETTINGS,
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter((item) => item.severity === 'error');
  if (errors.length) throw new Error(`Registry compile failed (${errors.length}).`);
  const compiled = output.contracts?.[REGISTRY_CONTRACT_PATH]?.[REGISTRY_CONTRACT_NAME];
  if (!compiled) throw new Error('Registry artifact is unavailable.');

  const creationBytecode = `0x${compiled.evm.bytecode.object}`;
  const runtimeBytecode = `0x${compiled.evm.deployedBytecode.object}`;
  const constructorAbi = compiled.abi.find((item) => item.type === 'constructor');
  const expectedSelectors = Object.fromEntries(Object.entries(compiled.evm.methodIdentifiers).sort());
  assert.equal(solc.version().split('+')[0], REGISTRY_COMPILER_VERSION);
  assert.equal(expectedSelectors[PUBLISH_REPORT_SIGNATURE], PUBLISH_REPORT_SELECTOR.slice(2));
  assert.equal(keccakHex(REPORT_PUBLISHED_SIGNATURE), REPORT_PUBLISHED_TOPIC);
  assert.equal(constructorAbi, undefined);
  assert.ok(creationBytecode.length > 2 && runtimeBytecode.length > 2);
  assert.ok(encodePublishReport({
    projectId: `0x${'11'.repeat(32)}`,
    sourceHash: `0x${'22'.repeat(32)}`,
    reportHash: `0x${'33'.repeat(32)}`,
    score: 0,
    scannerVersion: '4.0.0-gc.1|report:4.1.0|hash:v2|proof:4.1',
    reportURI: '',
  }).startsWith(PUBLISH_REPORT_SELECTOR));

  const ownership = {
    ownerOrAdmin: /\b(owner|admin)\b/u.test(source),
    upgradeable: /\b(upgradeTo|delegatecall|proxy)\b/u.test(source),
    pauseCapability: /\b(pause|paused|unpause)\b/u.test(source),
    constructorArguments: constructorAbi?.inputs ?? [],
  };
  assert.deepEqual(ownership, { ownerOrAdmin: false, upgradeable: false, pauseCapability: false, constructorArguments: [] });

  return Object.freeze({
    source,
    input: stable(input),
    abi: stable(compiled.abi),
    creationBytecode,
    runtimeBytecode,
    methodIdentifiers: expectedSelectors,
    sourceDigest: sha256(Buffer.from(source, 'utf8')),
    abiDigest: sha256(Buffer.from(canonical(compiled.abi), 'utf8')),
    creationBytecodeDigest: sha256(Buffer.from(creationBytecode.slice(2), 'hex')),
    runtimeBytecodeDigest: sha256(Buffer.from(runtimeBytecode.slice(2), 'hex')),
    compiler: Object.freeze({ name: 'solc', version: REGISTRY_COMPILER_VERSION, longVersion: solc.version() }),
  });
}

export function loadProductionCandidate({ root = ROOT } = {}) {
  return JSON.parse(fs.readFileSync(path.join(root, 'deployment', 'arc-mainnet-registry-candidate.json'), 'utf8'));
}

export function assertArtifactMatchesCandidate(artifact, candidate = loadProductionCandidate()) {
  const checks = [
    ['contractName', REGISTRY_CONTRACT_NAME, candidate.contractName],
    ['compilerVersion', REGISTRY_COMPILER_VERSION, candidate.compilerVersion],
    ['sourceDigest', artifact.sourceDigest, candidate.sourceDigest],
    ['abiDigest', artifact.abiDigest, candidate.abiDigest],
    ['creationBytecodeDigest', artifact.creationBytecodeDigest, candidate.creationBytecodeDigest],
    ['runtimeBytecodeDigest', artifact.runtimeBytecodeDigest, candidate.runtimeBytecodeDigest],
    ['compilerSettings', canonical(REGISTRY_COMPILER_SETTINGS), canonical(candidate.compilerSettings)],
    ['constructorArgs', canonical(REGISTRY_CONSTRUCTOR_ARGS), canonical(candidate.constructorArgs)],
  ];
  const mismatch = checks.find(([, expected, actual]) => expected !== actual);
  if (mismatch) throw Object.assign(new Error(`Production Registry candidate mismatch: ${mismatch[0]}.`), { code: 'REGISTRY_ARTIFACT_MISMATCH', field: mismatch[0] });
  return true;
}

export function buildArtifactTruth(options = {}) {
  const artifact = compileRegistryArtifact(options);
  const candidate = options.candidate ?? loadProductionCandidate(options);
  assertArtifactMatchesCandidate(artifact, candidate);
  return Object.freeze({ artifact, candidate });
}
