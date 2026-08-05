import { PUBLISH_REPORT_SELECTOR, ARC_TESTNET } from '../packages/proof/src/registry.js';
import { resolveProofNetwork } from '../packages/proof/v4/network.js';

const network = resolveProofNetwork();
const endpoint = ARC_TESTNET.rpcUrls[0];
const methods = Object.freeze(['eth_chainId', 'eth_getCode', 'eth_blockNumber']);
let requestId = 0;

async function readOnlyRpc(method, params = []) {
  if (!methods.includes(method)) throw new Error('Only the fixed Arc read-only acceptance methods are allowed.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
    });
    if (!response.ok) throw new Error(`Arc RPC returned HTTP ${response.status}.`);
    const body = await response.json();
    if (body.error || typeof body.result !== 'string') throw new Error('Arc RPC returned an invalid read-only response.');
    return body.result.toLowerCase();
  } finally { clearTimeout(timer); }
}

const chainId = await readOnlyRpc('eth_chainId');
if (Number.parseInt(chainId, 16) !== network.chainId) throw new Error('Arc Testnet chain ID mismatch.');
const code = await readOnlyRpc('eth_getCode', [network.registryAddress, 'latest']);
if (!/^0x[0-9a-f]+$/u.test(code) || code === '0x' || !code.includes(PUBLISH_REPORT_SELECTOR.slice(2).toLowerCase())) throw new Error('Trusted Registry V2 runtime or publish selector is unavailable.');
const blockNumber = await readOnlyRpc('eth_blockNumber');
if (!/^0x[0-9a-f]+$/u.test(blockNumber) || Number.parseInt(blockNumber, 16) <= 0) throw new Error('Arc Testnet block number is invalid.');

console.log(JSON.stringify({ passed: true, readOnly: true, methods, chainId, registryAddress: network.registryAddress, registryCodeBytes: (code.length - 2) / 2, publishSelectorPresent: true, blockNumber, transactionSent: false }));
