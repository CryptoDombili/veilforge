import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  ARC_TESTNET,
  PUBLISH_REPORT_SELECTOR,
  buildProofPayload,
  encodePublishReport,
  publishReport,
} from '../packages/proof/src/registry.js';

const report = {
  projectId: `0x${'11'.repeat(32)}`,
  sourceHash: `0x${'22'.repeat(32)}`,
  reportHash: `0x${'33'.repeat(32)}`,
  score: 85,
  scannerVersion: '1.8.0',
};

test('proof encoder preserves contract argument order', () => {
  const data = encodePublishReport({ ...buildProofPayload(report, 'ipfs://report') });
  assert.equal(data.slice(0, 10), PUBLISH_REPORT_SELECTOR);
  const words = data.slice(10, 10 + 64 * 6).match(/.{64}/g);
  assert.equal(`0x${words[0]}`, report.projectId);
  assert.equal(`0x${words[1]}`, report.sourceHash);
  assert.equal(`0x${words[2]}`, report.reportHash);
  assert.equal(Number.parseInt(words[3], 16), 85);
  assert.equal(Number.parseInt(words[4], 16), 192);
  assert.equal(Number.parseInt(words[5], 16), 256);

  const tail = data.slice(10 + 64 * 6);
  const uriLength = Number.parseInt(tail.slice(0, 64), 16);
  const uri = new TextDecoder().decode(Uint8Array.from(tail.slice(64, 64 + uriLength * 2).match(/../g).map((hex) => Number.parseInt(hex, 16))));
  const versionOffset = (256 - 192) * 2;
  const versionLength = Number.parseInt(tail.slice(versionOffset, versionOffset + 64), 16);
  const version = new TextDecoder().decode(Uint8Array.from(tail.slice(versionOffset + 64, versionOffset + 64 + versionLength * 2).match(/../g).map((hex) => Number.parseInt(hex, 16))));
  assert.equal(uri, 'ipfs://report');
  assert.equal(version, '1.8.0');
});

test('wallet publication switches to Arc then sends one transaction', async () => {
  const calls = [];
  const provider = {
    async request(request) {
      calls.push(request);
      if (request.method === 'eth_requestAccounts') return ['0x0000000000000000000000000000000000000001'];
      if (request.method === 'eth_chainId') return ARC_TESTNET.chainIdHex;
      if (request.method === 'eth_sendTransaction') return `0x${'ab'.repeat(32)}`;
      throw new Error(`Unexpected method ${request.method}`);
    },
  };
  const response = await publishReport({
    provider,
    registryAddress: '0xf8b1D03931f2c11B642259d9aB19cfA3351C0Bbc',
    report,
    reportURI: '',
  });
  assert.equal(response.account, '0x0000000000000000000000000000000000000001');
  const transaction = calls.find((call) => call.method === 'eth_sendTransaction');
  assert.ok(transaction);
  assert.equal(transaction.params[0].to, '0xf8b1D03931f2c11B642259d9aB19cfA3351C0Bbc');
  assert.equal(transaction.params[0].data.slice(0, 10), PUBLISH_REPORT_SELECTOR);
});


test('reference registry source exposes the same publication ABI order', () => {
  const source = fs.readFileSync('contracts/VeilForgeReportRegistry.sol', 'utf8');
  assert.match(source, /function\s+publishReport\s*\(\s*bytes32\s+projectId,\s*bytes32\s+sourceHash,\s*bytes32\s+reportHash,\s*uint16\s+score,\s*string\s+calldata\s+reportURI,\s*string\s+calldata\s+scannerVersion\s*\)/s);
  assert.equal(PUBLISH_REPORT_SELECTOR, '0x6133eb3a');
});
