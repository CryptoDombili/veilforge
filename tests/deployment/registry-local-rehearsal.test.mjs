import test from 'node:test';
import assert from 'node:assert/strict';
import { runLocalRegistryRehearsal } from '../../scripts/rehearse-registry-local.mjs';
import { buildRegistryDeploymentManifest } from '../../scripts/rehearse-arc-mainnet-registry.mjs';
import { buildArtifactTruth } from '../../scripts/lib/registry-artifact.mjs';

let rehearsalPromise;
const localRehearsal = () => { rehearsalPromise ??= runLocalRegistryRehearsal(); return rehearsalPromise; };

test('local ephemeral EVM deploys and verifies exact Registry runtime', async () => {
  const result = await localRehearsal();
  assert.equal(result.manifest.environment, 'local');
  assert.equal(result.manifest.deploymentStatus, 'rehearsal');
  assert.match(result.manifest.contractAddress, /^0x[0-9a-fA-F]{40}$/u);
  assert.match(result.manifest.transactionHash, /^0x[0-9a-fA-F]{64}$/u);
  assert.equal(result.checks.deploymentReceipt, true);
  assert.equal(result.checks.runtimeBytecodeExactMatch, true);
});

test('local Registry constants publish event overwrite and namespace isolation pass', async () => {
  const { checks } = await localRehearsal();
  assert.equal(checks.registryVersion, true);
  assert.equal(checks.publisherScopedConstant, true);
  assert.equal(checks.publishEvent, true);
  assert.equal(checks.samePublisherOverwrite, true);
  assert.equal(checks.publisherNamespaceIsolation, true);
});

test('rehearsal local and future deployment share exact artifact truth', async () => {
  const { artifact } = buildArtifactTruth();
  const productionRehearsal = buildRegistryDeploymentManifest();
  const local = await localRehearsal();
  assert.equal(productionRehearsal.manifest.creationBytecodeDigest, artifact.creationBytecodeDigest);
  assert.equal(local.manifest.creationBytecodeDigest, artifact.creationBytecodeDigest);
  assert.equal(productionRehearsal.manifest.runtimeBytecodeDigest, artifact.runtimeBytecodeDigest);
  assert.equal(local.manifest.runtimeBytecodeDigest, artifact.runtimeBytecodeDigest);
});
