import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWebProofEnvelope, prepareWebRegistryPublish, safeTransactionRequest, verifyWebProofEnvelope } from '../../../apps/web/v4/proof-adapter.js';
import { ACCOUNT, currentReport, incompleteReport, readyProof, TX_HASH, verification } from './helpers.mjs';

const wallet = (overrides = {}) => ({ providerAvailable: true, connected: true, account: ACCOUNT, accounts: [ACCOUNT], chainId: 5_042_002, ...overrides });

test('trusted wallet preflight prepares a deterministic source-free request', async () => {
  const result = await readyProof();
  assert.equal(result.preflight.status, 'ready-to-publish');
  assert.equal(result.preflight.transactionRequest.to, result.envelope.registryAddress);
  assert.equal(result.preflight.transactionRequest.value, '0x0');
  assert.doesNotMatch(JSON.stringify(result.preflight), /contract Case|sourceCode|"(?:provider|signer)":/u);
});

test('unverified report is blocked without partial request', async () => {
  const result = await prepareWebRegistryPublish({ verification: null, envelope: null, walletState: wallet() });
  assert.equal(result.status, 'report-unverified'); assert.equal(result.transactionRequest, null);
});

test('tampered envelope fails closed', async () => {
  const verified = await verification(); const proofEnvelope = structuredClone(await createWebProofEnvelope(verified)); proofEnvelope.reportHash = `sha256:${'00'.repeat(32)}`;
  const result = await prepareWebRegistryPublish({ verification: verified, envelope: proofEnvelope, walletState: wallet() });
  assert.equal(result.status, 'preflight-failed'); assert.equal(result.transactionRequest, null);
});

test('incomplete proof requires disclosure acknowledgement', async () => {
  const verified = await verification(incompleteReport()); const proofEnvelope = await createWebProofEnvelope(verified);
  const blocked = await prepareWebRegistryPublish({ verification: verified, envelope: proofEnvelope, walletState: wallet(), disclosureAcknowledged: false });
  assert.ok(blocked.blockingReasons.includes('incomplete-disclosure'));
  const allowed = await prepareWebRegistryPublish({ verification: verified, envelope: proofEnvelope, walletState: wallet(), disclosureAcknowledged: true });
  assert.equal(allowed.status, 'ready-to-publish'); assert.ok(allowed.warnings.includes('incomplete-analysis'));
});

test('wallet unavailable and account unavailable fail closed', async () => {
  const verified = await verification(); const proofEnvelope = await createWebProofEnvelope(verified);
  const unavailable = await prepareWebRegistryPublish({ verification: verified, envelope: proofEnvelope, walletState: { providerAvailable: false } });
  const accountless = await prepareWebRegistryPublish({ verification: verified, envelope: proofEnvelope, walletState: wallet({ connected: false, account: null }) });
  assert.ok(unavailable.blockingReasons.includes('provider-available')); assert.ok(accountless.blockingReasons.includes('account-available'));
});

test('wrong network is explicit and produces no request', async () => {
  const verified = await verification(); const proofEnvelope = await createWebProofEnvelope(verified);
  const result = await prepareWebRegistryPublish({ verification: verified, envelope: proofEnvelope, walletState: wallet({ chainId: 1 }) });
  assert.equal(result.status, 'wrong-network'); assert.equal(result.transactionRequest, null);
});

test('arbitrary registry substitution fails envelope verification', async () => {
  const verified = await verification(); const proofEnvelope = structuredClone(await createWebProofEnvelope(verified)); proofEnvelope.registryAddress = ACCOUNT;
  await assert.rejects(() => verifyWebProofEnvelope(proofEnvelope, { verification }), (error) => error.code === 'WEB_V4_PROOF_ENVELOPE_INVALID');
});

test('identical preflight is byte deterministic', async () => {
  const verified = await verification(); const proofEnvelope = await createWebProofEnvelope(verified); const input = { verification: verified, envelope: proofEnvelope, walletState: wallet() };
  assert.deepEqual(await prepareWebRegistryPublish(input), await prepareWebRegistryPublish(input));
});

test('safe transaction request accepts only trusted zero-value Registry V2 calls', async () => {
  const { envelope: proofEnvelope, preflight } = await readyProof();
  assert.deepEqual(safeTransactionRequest(preflight.transactionRequest), preflight.transactionRequest);
  assert.throws(() => safeTransactionRequest({ ...preflight.transactionRequest, to: ACCOUNT }));
  assert.throws(() => safeTransactionRequest({ ...preflight.transactionRequest, value: '0x1' }));
});

test('matching duplicate is idempotent and prepares no transaction', async () => {
  const first = await readyProof();
  const identity = { chainId: first.envelope.chainId, networkKey: first.envelope.networkKey, registryAddress: first.envelope.registryAddress, registryContractVersion: first.envelope.registryContractVersion, transactionHash: TX_HASH, blockNumber: 42, publisher: ACCOUNT, reportHash: first.envelope.reportHash, status: 'confirmed', explorerUrl: `https://testnet.arcscan.app/tx/${TX_HASH}` };
  const duplicate = await prepareWebRegistryPublish({ verification: first.verification, envelope: first.envelope, walletState: first.walletState, existingRecord: { ...first.preflight.payload, publisher: ACCOUNT }, existingTransactionIdentity: identity });
  assert.equal(duplicate.status, 'already-published'); assert.equal(duplicate.transactionRequest, null); assert.deepEqual(duplicate.transactionIdentity, identity);
});

test('duplicate transaction identity is verified before explorer reuse', async () => {
  const first = await readyProof();
  const existingRecord = { ...first.preflight.payload, publisher: ACCOUNT };
  const identity = { chainId: first.envelope.chainId, networkKey: first.envelope.networkKey, registryAddress: first.envelope.registryAddress, registryContractVersion: first.envelope.registryContractVersion, transactionHash: TX_HASH, blockNumber: 42, publisher: ACCOUNT, reportHash: first.envelope.reportHash, status: 'confirmed', explorerUrl: `https://testnet.arcscan.app/tx/${TX_HASH}` };
  await assert.rejects(() => prepareWebRegistryPublish({ verification: first.verification, envelope: first.envelope, walletState: first.walletState, existingRecord, existingTransactionIdentity: { ...identity, explorerUrl: 'https://evil.example/tx/fake' } }));
});

test('conflicting duplicate is rejected', async () => {
  const first = await readyProof();
  await assert.rejects(() => prepareWebRegistryPublish({ verification: first.verification, envelope: first.envelope, walletState: first.walletState, existingRecord: { ...first.preflight.payload, reportHash: `0x${'ff'.repeat(32)}`, publisher: ACCOUNT } }));
});

test('different chain cannot replay the same publication identity', async () => {
  const first = await readyProof();
  const replay = await prepareWebRegistryPublish({ verification: first.verification, envelope: first.envelope, walletState: wallet({ chainId: 5_042_003 }) });
  assert.equal(replay.status, 'wrong-network');
});

test('web proof path cannot send or switch a transaction', () => {
  const source = fs.readFileSync(new URL('../../../apps/web/v4/proof-adapter.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /eth_sendTransaction|wallet_switchEthereumChain|request\s*\(/u);
});

test('transaction summary hides raw calldata and invented gas data', async () => {
  const { preflight } = await readyProof();
  assert.equal(preflight.transactionSummary.gasEstimateStatus, 'not-requested');
  assert.equal('data' in preflight.transactionSummary, false); assert.equal('gasPrice' in preflight.transactionSummary, false);
});
