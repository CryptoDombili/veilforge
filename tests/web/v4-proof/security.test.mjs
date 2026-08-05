import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWebProofEnvelope, prepareWebRegistryPublish, verifyWebProofEnvelope } from '../../../apps/web/v4/proof-adapter.js';
import { simulateTransactionBoundary } from '../../../apps/web/v4/proof-lifecycle.js';
import { renderPreflightChecks } from '../../../apps/web/v4/proof-ui.js';
import { classifyProviderError } from '../../../apps/web/v4/proof-wallet.js';
import { ACCOUNT, currentReport, readyProof, verification } from './helpers.mjs';

test('forged verified flag cannot bypass report integrity', async () => {
  const report = currentReport(); report.project.projectId = 'tampered';
  await assert.rejects(() => createWebProofEnvelope({ verified: true, reportHash: report.integrity.reportHash, report }));
});

test('prototype-pollution envelope keys fail closed', async () => {
  const proof = await readyProof(); const value = JSON.parse(JSON.stringify(proof.envelope)); value.__proto_payload = { admin: true };
  await assert.rejects(() => verifyWebProofEnvelope(value)); assert.equal({}.admin, undefined);
});

test('preflight UI escapes malicious labels and project text', () => {
  const html = renderPreflightChecks({ checks: [{ id: '<img src=x onerror=alert(1)>', passed: false, message: '<script>alert(1)</script>' }] });
  assert.doesNotMatch(html, /<script>|<img/u); assert.match(html, /&lt;script&gt;/u);
});

test('huge provider errors are classified without echoing internals', () => {
  const classified = classifyProviderError({ message: `C:\\secret\\Case.sol ${'x'.repeat(100_000)}` });
  assert.equal(classified.state, 'provider-unavailable'); assert.doesNotMatch(JSON.stringify(classified), /Case\.sol|xxxx/u);
});

test('malformed and injected transaction hashes fail safely', async () => {
  const proof = await readyProof();
  const invalid = await simulateTransactionBoundary(proof.preflight.transactionRequest, 'success', { transactionHash: '0x1/../../evil' });
  assert.equal(invalid.status, 'receipt-invalid');
});

test('mock lifecycle covers reject timeout pending revert and cancel without provider calls', async () => {
  const proof = await readyProof(); const request = proof.preflight.transactionRequest;
  assert.equal((await simulateTransactionBoundary(request, 'user-rejected')).status, 'user-rejected');
  assert.equal((await simulateTransactionBoundary(request, 'timeout')).status, 'timeout');
  assert.equal((await simulateTransactionBoundary(request, 'pending')).status, 'pending');
  assert.equal((await simulateTransactionBoundary(request, 'revert')).status, 'reverted');
  assert.equal((await simulateTransactionBoundary(request, 'cancelled')).status, 'cancelled');
});

test('arbitrary registry address cannot pass preflight', async () => {
  const verified = await verification(); const envelope = structuredClone(await createWebProofEnvelope(verified)); envelope.registryAddress = ACCOUNT;
  const result = await prepareWebRegistryPublish({ verification: verified, envelope, walletState: { providerAvailable: true, connected: true, account: ACCOUNT, chainId: 5_042_002 } });
  assert.equal(result.transactionRequest, null);
});

test('proof modules have no eval, dynamic function, secrets or send RPC', () => {
  const names = ['proof-adapter.js', 'proof-wallet.js', 'proof-receipt.js', 'proof-persistence.js', 'proof-lifecycle.js'];
  const source = names.map((name) => fs.readFileSync(new URL(`../../../apps/web/v4/${name}`, import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(source, /\beval\s*\(|new Function|eth_sendTransaction|privateKey\s*=|seedPhrase\s*=/u);
});
