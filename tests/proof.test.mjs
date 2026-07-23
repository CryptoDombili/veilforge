import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  ARC_TESTNET,
  PUBLISH_REPORT_SELECTOR,
  buildProofPayload,
  encodePublishReport,
  publishReport,
  ensureArcTestnet,
} from '../packages/proof/src/registry.js';

const report = {
  projectId: `0x${'11'.repeat(32)}`,
  sourceHash: `0x${'22'.repeat(32)}`,
  reportHash: `0x${'33'.repeat(32)}`,
  score: 85,
  scannerVersion: '1.8.0',
};


test('Arc Testnet wallet parameters match the published network definition', () => {
  assert.equal(ARC_TESTNET.chainId, 5_042_002);
  assert.equal(ARC_TESTNET.chainIdHex.toLowerCase(), '0x4cef52');
  assert.equal(Number.parseInt(ARC_TESTNET.chainIdHex, 16), ARC_TESTNET.chainId);
  assert.deepEqual(ARC_TESTNET.nativeCurrency, { name: 'USDC', symbol: 'USDC', decimals: 18 });
  assert.deepEqual(ARC_TESTNET.rpcUrls, ['https://rpc.testnet.arc.network']);
  assert.deepEqual(ARC_TESTNET.blockExplorerUrls, ['https://testnet.arcscan.app']);
});

test('unknown Arc network is added with correct values, selected, and verified', async () => {
  const calls = [];
  let chainId = '0x1';
  let switchAttempts = 0;
  const provider = {
    async request(request) {
      calls.push(request);
      if (request.method === 'eth_chainId') return chainId;
      if (request.method === 'wallet_switchEthereumChain') {
        switchAttempts += 1;
        if (switchAttempts === 1) {
          const error = new Error('Unknown chain');
          error.data = { originalError: { code: 4902 } };
          throw error;
        }
        chainId = request.params[0].chainId;
        return null;
      }
      if (request.method === 'wallet_addEthereumChain') return null;
      throw new Error(`Unexpected method ${request.method}`);
    },
  };

  await ensureArcTestnet(provider);
  const addCall = calls.find((call) => call.method === 'wallet_addEthereumChain');
  assert.ok(addCall);
  assert.deepEqual(addCall.params[0], {
    chainId: '0x4CEF52',
    chainName: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: ['https://rpc.testnet.arc.network'],
    blockExplorerUrls: ['https://testnet.arcscan.app'],
  });
  assert.equal(switchAttempts, 2);
  assert.equal(chainId.toLowerCase(), '0x4cef52');
});

test('proof encoder preserves the deployed scannerVersion then reportURI order', () => {
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
  const versionLength = Number.parseInt(tail.slice(0, 64), 16);
  const version = new TextDecoder().decode(Uint8Array.from(
    tail.slice(64, 64 + versionLength * 2).match(/../g).map((hex) => Number.parseInt(hex, 16)),
  ));
  const uriOffset = (256 - 192) * 2;
  const uriLength = Number.parseInt(tail.slice(uriOffset, uriOffset + 64), 16);
  const uri = new TextDecoder().decode(Uint8Array.from(
    tail.slice(uriOffset + 64, uriOffset + 64 + uriLength * 2).match(/../g).map((hex) => Number.parseInt(hex, 16)),
  ));
  assert.equal(version, '1.8.0');
  assert.equal(uri, 'ipfs://report');
});

test('wallet publication simulates, sends, and confirms one transaction', async () => {
  const calls = [];
  const provider = {
    async request(request) {
      calls.push(request);
      if (request.method === 'eth_requestAccounts') return ['0x0000000000000000000000000000000000000001'];
      if (request.method === 'eth_chainId') return ARC_TESTNET.chainIdHex;
      if (request.method === 'eth_call') return '0x';
      if (request.method === 'eth_sendTransaction') return `0x${'ab'.repeat(32)}`;
      if (request.method === 'eth_getTransactionReceipt') return { status: '0x1', transactionHash: `0x${'ab'.repeat(32)}` };
      throw new Error(`Unexpected method ${request.method}`);
    },
  };
  const response = await publishReport({
    provider,
    registryAddress: '0xf8b1D03931f2c11B642259d9aB19cfA3351C0Bbc',
    report,
    reportURI: '',
    pollIntervalMs: 0,
  });
  assert.equal(response.account, '0x0000000000000000000000000000000000000001');
  assert.equal(response.confirmed, true);
  assert.ok(calls.find((call) => call.method === 'eth_call'));
  const transaction = calls.find((call) => call.method === 'eth_sendTransaction');
  assert.ok(transaction);
  assert.equal(transaction.params[0].to, '0xf8b1D03931f2c11B642259d9aB19cfA3351C0Bbc');
  assert.equal(transaction.params[0].data.slice(0, 10), PUBLISH_REPORT_SELECTOR);
});

test('wallet publication rejects a mined transaction with failed status', async () => {
  const provider = {
    async request(request) {
      if (request.method === 'eth_requestAccounts') return ['0x0000000000000000000000000000000000000001'];
      if (request.method === 'eth_chainId') return ARC_TESTNET.chainIdHex;
      if (request.method === 'eth_call') return '0x';
      if (request.method === 'eth_sendTransaction') return `0x${'cd'.repeat(32)}`;
      if (request.method === 'eth_getTransactionReceipt') return { status: '0x0', transactionHash: `0x${'cd'.repeat(32)}` };
      throw new Error(`Unexpected method ${request.method}`);
    },
  };

  await assert.rejects(
    publishReport({
      provider,
      registryAddress: '0xf8b1D03931f2c11B642259d9aB19cfA3351C0Bbc',
      report,
      pollIntervalMs: 0,
    }),
    (error) => {
      assert.match(error.message, /mined but reverted/i);
      assert.match(error.explorerUrl, /testnet\.arcscan\.app\/tx\//);
      return true;
    },
  );
});

test('reference registry source exposes the same publication ABI order', () => {
  const source = fs.readFileSync('contracts/VeilForgeReportRegistry.sol', 'utf8');
  assert.match(source, /function\s+publishReport\s*\(\s*bytes32\s+projectId,\s*bytes32\s+sourceHash,\s*bytes32\s+reportHash,\s*uint16\s+score,\s*string\s+calldata\s+scannerVersion,\s*string\s+calldata\s+reportURI\s*\)/s);
  assert.match(source, /error\s+EmptyScannerVersion\s*\(\s*\)/);
  assert.equal(PUBLISH_REPORT_SELECTOR, '0x6133eb3a');
});
