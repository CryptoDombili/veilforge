import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ARC_MAINNET_REGISTRY_ADDRESS,
  ARC_MAINNET_REGISTRY_RUNTIME_DIGEST,
  DEFAULT_PROOF_NETWORK,
  PROOF_NETWORKS,
} from '../../packages/proof/v4/network.js';

const manifest = JSON.parse(fs.readFileSync(
  new URL('../../deployment/arc-mainnet-proof-publication.json', import.meta.url),
  'utf8',
));

const expectedFixture = Object.freeze({
  fixtureId: 'veilforge-mainnet-smoke-v1',
  publisher: '0x17aDD951d71A3c79Cfa389A61f7494F3a8146E4b',
  projectId: '0x79eaebf2c0f45acf6b7b020c6f41251697c2da74ee89cdbd891095b5e8d9bef6',
  sourceHash: '0xfdf96446a810a68e555f00245a15abf862362c522555174e00fff4921a793bf1',
  reportHash: '0x2975be1220e026f3b2768b59d212bda840569890e905cf4c3098d3b3d166ec4a',
  score: 0,
  scannerVersion: '4.0.0-gc.1|report:4.1.0|hash:v2|proof:4.1|mainnet-smoke:v1',
  reportURI: 'veilforge://mainnet-smoke/veilforge-mainnet-smoke-v1',
});

test('Arc Mainnet proof publication evidence is bound to the verified registry and receipt', () => {
  assert.equal(manifest.manifestVersion, 'veilforge.proof.publication.v1');
  assert.equal(manifest.networkKey, 'arc-mainnet');
  assert.equal(manifest.chainId, 5_042);
  assert.equal(manifest.registryAddress, ARC_MAINNET_REGISTRY_ADDRESS);
  assert.equal(manifest.runtimeBytecodeDigest, ARC_MAINNET_REGISTRY_RUNTIME_DIGEST);
  assert.equal(manifest.transactionHash, '0xc546c684ccc4a04ae2466926972a3c20d53c8b4616022f03240f4319d3de1693');
  assert.equal(manifest.receiptStatusHex, '0x1');
  assert.equal(manifest.blockNumber, 21_545_612);
  assert.equal(manifest.gasUsed, '236022');
  assert.equal(manifest.effectiveGasPrice, '21000000000');
  assert.equal(manifest.actualFeeBaseUnits, '4956462000000000');
});

test('decoded event and registry readback match the controlled fixture', () => {
  for (const [key, value] of Object.entries(expectedFixture)) {
    assert.equal(manifest[key], value);
    if (key !== 'fixtureId') {
      assert.equal(manifest.decodedEvent[key], value);
      assert.equal(manifest.postPublishReadback[key], value);
    }
  }
  assert.equal(manifest.decodedEvent.eventName, 'ReportPublished');
  assert.equal(manifest.postPublishReadback.exists, true);
  assert.equal(manifest.postPublishReadback.publishedAt, 1_789_758_626);
  assert.equal(manifest.blockTimestamp, '2026-09-18T19:10:26.000Z');
});

test('publication was one-shot and its historical final state remains recorded', () => {
  assert.deepEqual(manifest.verification, {
    transactionCalldataExactMatch: true,
    receiptIdentityMatch: true,
    eventMatch: true,
    readbackMatch: true,
    receiptEventReadbackConsistency: true,
    duplicateGuardOnChain: true,
    oneShotPermissionConsumed: true,
    secondAuthorizationHttpStatus: 409,
  });
  assert.equal(manifest.publicationTransactionCount, 1);
  assert.equal(manifest.registryDeploymentTransactionCountDuringStage, 0);
  assert.equal(manifest.otherMainnetWriteTransactionCount, 0);
  assert.equal(manifest.publishEnabledFinal, false);
  assert.equal(manifest.publicationStatus, 'verified');

  const mainnet = PROOF_NETWORKS['arc-mainnet'];
  assert.equal(mainnet.enabled, true);
  assert.equal(mainnet.proofReadEnabled, true);
  assert.equal(mainnet.publishEnabled, true);
  assert.equal(DEFAULT_PROOF_NETWORK, 'arc-testnet');
});
