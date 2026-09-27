import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ARC_MAINNET_DEPLOY_CHAIN_ID,
  BROADCAST_CONFIRMATION_VALUE,
  assertArcMainnetChainId,
  assertBroadcastAuthorization,
  assertRegistryCreationTransaction,
  broadcastRegistryDeployment,
  buildProductionDryRunPlan,
  buildRegistryCreationTransaction,
  parseDeploymentArgs,
  redactSensitive,
  runProductionDeployment,
  sanitizeRpcUrl,
} from '../../scripts/deploy-arc-mainnet-registry.mjs';
import { assertArtifactMatchesCandidate, buildArtifactTruth } from '../../scripts/lib/registry-artifact.mjs';
import { ARC_MAINNET_REGISTRY_ADDRESS, ARC_MAINNET_REGISTRY_RUNTIME_DIGEST, ARC_TESTNET_REGISTRY_ADDRESS, PROOF_NETWORKS } from '../../packages/proof/v4/network.js';

const { artifact, candidate } = buildArtifactTruth();
const cleanGit = Object.freeze({ gitCommit: 'a'.repeat(40), dirty: false });

test('default deploy command is an offline non-broadcast dry run', async () => {
  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('network forbidden'); };
  let output = '';
  try {
    const result = await runProductionDeployment({ args: [], env: {}, stdout: { write(value) { output += value; } } });
    assert.equal(result.broadcast, false);
    assert.equal(result.plan.broadcast, false);
    assert.equal(result.plan.estimatedGas, 'UNRESOLVED / NOT QUERIED');
    assert.equal(result.plan.estimatedFee, 'UNRESOLVED / NOT QUERIED');
    assert.equal(fetchCalls, 0);
    assert.doesNotMatch(output, /private.?key|seed.?phrase/iu);
  } finally { globalThis.fetch = previousFetch; }
});

test('broadcast requires both CLI flag and exact environment confirmation', () => {
  assert.equal(parseDeploymentArgs([]).broadcast, false);
  assert.throws(() => assertBroadcastAuthorization({ broadcast: false, confirmation: BROADCAST_CONFIRMATION_VALUE, git: cleanGit }), (error) => error.code === 'DEPLOY_BROADCAST_FLAG_REQUIRED');
  assert.throws(() => assertBroadcastAuthorization({ broadcast: true, confirmation: '', git: cleanGit }), (error) => error.code === 'DEPLOY_CONFIRMATION_REQUIRED');
  assert.equal(assertBroadcastAuthorization({ broadcast: true, confirmation: BROADCAST_CONFIRMATION_VALUE, git: cleanGit }), true);
});

test('secrets cannot be supplied as deployment CLI arguments', () => {
  assert.throws(() => parseDeploymentArgs(['--private-key=0xdead']), (error) => error.code === 'DEPLOY_ARGUMENT_INVALID');
  assert.throws(() => parseDeploymentArgs(['--rpc-url=https://example.invalid']), (error) => error.code === 'DEPLOY_ARGUMENT_INVALID');
});

test('chain gate accepts only exact Arc Mainnet 5042 and rejects Testnet random and missing IDs', () => {
  assert.equal(assertArcMainnetChainId(5_042), ARC_MAINNET_DEPLOY_CHAIN_ID);
  assert.equal(assertArcMainnetChainId('0x13b2'), ARC_MAINNET_DEPLOY_CHAIN_ID);
  for (const chainId of [5_042_002, '0x4cef52', 1, '0x1']) assert.throws(() => assertArcMainnetChainId(chainId), (error) => error.code === 'DEPLOY_CHAIN_ID_MISMATCH');
  assert.throws(() => assertArcMainnetChainId(null), (error) => error.code === 'DEPLOY_CHAIN_ID_MISSING');
});

test('candidate truth rejects creation and runtime digest drift', () => {
  assert.throws(() => assertArtifactMatchesCandidate(artifact, { ...candidate, creationBytecodeDigest: `sha256:${'00'.repeat(32)}` }), (error) => error.code === 'REGISTRY_ARTIFACT_MISMATCH' && error.field === 'creationBytecodeDigest');
  assert.throws(() => assertArtifactMatchesCandidate(artifact, { ...candidate, runtimeBytecodeDigest: `sha256:${'00'.repeat(32)}` }), (error) => error.code === 'REGISTRY_ARTIFACT_MISMATCH' && error.field === 'runtimeBytecodeDigest');
});

test('deployment transaction is fixed to zero-value constructor creation with no arguments', () => {
  const transaction = buildRegistryCreationTransaction(artifact);
  assert.equal(transaction.to, null);
  assert.equal(transaction.value, 0n);
  assert.equal(transaction.data, artifact.creationBytecode);
  assert.throws(() => buildRegistryCreationTransaction(artifact, { value: '0x1' }), (error) => error.code === 'DEPLOY_VALUE_NONZERO');
  assert.throws(() => buildRegistryCreationTransaction(artifact, { constructorArgs: ['unexpected'] }), (error) => error.code === 'DEPLOY_CONSTRUCTOR_ARGS_INVALID');
  assert.throws(() => assertRegistryCreationTransaction({ ...transaction, to: ARC_TESTNET_REGISTRY_ADDRESS }, artifact), (error) => error.code === 'DEPLOY_TARGET_INVALID');
  assert.throws(() => assertRegistryCreationTransaction({ ...transaction, data: '0x1234' }, artifact), (error) => error.code === 'DEPLOY_BYTECODE_MISMATCH');
});

test('dirty source state blocks production broadcast by default', () => {
  assert.throws(() => assertBroadcastAuthorization({ broadcast: true, confirmation: BROADCAST_CONFIRMATION_VALUE, git: { ...cleanGit, dirty: true } }), (error) => error.code === 'DEPLOY_GIT_DIRTY');
});

test('private key and RPC credentials are redacted from diagnostics', () => {
  const privateKey = `0x${'12'.repeat(32)}`;
  const rpcUrl = 'https://user:password@rpc.example.invalid/path?api_key=super-secret-token';
  const redacted = redactSensitive(`key=${privateKey} rpc=${rpcUrl}`, [privateKey, rpcUrl]);
  assert.doesNotMatch(redacted, /12121212|password|super-secret-token/u);
  const sanitized = sanitizeRpcUrl(rpcUrl);
  assert.doesNotMatch(sanitized, /user|password|super-secret-token/u);
  assert.match(sanitized, /REDACTED/u);
});

test('lower-level broadcast repeats chain and exact transaction checks', async () => {
  const transaction = buildRegistryCreationTransaction(artifact);
  const calls = [];
  const signer = { async sendTransaction(value) { calls.push(value); return { hash: `0x${'ab'.repeat(32)}` }; } };
  await assert.rejects(() => broadcastRegistryDeployment({ rpcRequest: async () => '0x4cef52', signer, artifact, candidate, transaction, git: cleanGit, confirmation: BROADCAST_CONFIRMATION_VALUE }), (error) => error.code === 'DEPLOY_CHAIN_ID_MISMATCH');
  assert.equal(calls.length, 0);
  await broadcastRegistryDeployment({ rpcRequest: async () => '0x13b2', signer, artifact, candidate, transaction, git: cleanGit, confirmation: BROADCAST_CONFIRMATION_VALUE });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], transaction);
});

test('dry-run plan is source-bound and contains no invented deployment values', () => {
  const plan = buildProductionDryRunPlan({ artifact, candidate, git: cleanGit });
  assert.equal(plan.expectedChainId, 5_042);
  assert.equal(plan.creationBytecodeDigest, artifact.creationBytecodeDigest);
  assert.equal(plan.expectedRuntimeBytecodeDigest, artifact.runtimeBytecodeDigest);
  assert.equal(plan.broadcast, false);
  assert.equal(plan.deployerPublicAddress, 'UNRESOLVED / NOT QUERIED');
});

test('local artifacts cannot replace verified Arc Mainnet runtime config', () => {
  const mainnet = PROOF_NETWORKS['arc-mainnet'];
  assert.deepEqual({ registryAddress: mainnet.registryAddress, enabled: mainnet.enabled, proofReadEnabled: mainnet.proofReadEnabled, publishEnabled: mainnet.publishEnabled, deploymentStatus: mainnet.deploymentStatus }, {
    registryAddress: ARC_MAINNET_REGISTRY_ADDRESS, enabled: true, proofReadEnabled: true, publishEnabled: true, deploymentStatus: 'verified',
  });
  assert.equal(mainnet.registryRuntimeBytecodeDigest, ARC_MAINNET_REGISTRY_RUNTIME_DIGEST);
  const sources = ['packages/proof/v4/network.js', 'apps/web/config.js'].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(sources, /local-ephemeral-evm/u);
});
