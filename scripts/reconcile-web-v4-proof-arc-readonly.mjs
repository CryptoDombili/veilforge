import process from 'node:process';
import { ARC_TESTNET, PUBLISH_REPORT_SELECTOR } from '../packages/proof/src/registry.js';
import { checksumAddress, normalizeChainId, resolveProofNetwork } from '../packages/proof/v4/network.js';
import { decodeWebReportPublishedLog, WEB_REPORT_PUBLISHED_TOPIC } from '../apps/web/v4/proof-receipt.js';
import { REGISTRY_HAS_REPORT_SELECTOR } from '../apps/web/v4/proof-network-preflight.js';

const READ_ONLY = new Set(['eth_chainId', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_call']);
const args = process.argv.slice(2);
const after = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : null; };
const transactionHash = String(after('--tx') ?? '').toLowerCase();
const expectedPublisher = checksumAddress(after('--publisher'), 'publisher');
const expectedBlock = after('--block') === null ? null : Number(after('--block'));
if (!/^0x[0-9a-f]{64}$/u.test(transactionHash)) throw new Error('A valid --tx hash is required.');
if (expectedBlock !== null && (!Number.isSafeInteger(expectedBlock) || expectedBlock <= 0)) throw new Error('--block is invalid.');

let rpcId = 0;
async function rpc(method, params) {
  if (!READ_ONLY.has(method)) throw new Error('Only read-only reconciliation RPC methods are allowed.');
  const response = await fetch(ARC_TESTNET.rpcUrls[0], { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }) });
  if (!response.ok) throw new Error(`Arc read-only RPC failed with HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.error || payload.result === undefined) throw new Error('Arc read-only RPC returned an invalid result.');
  return payload.result;
}

const network = resolveProofNetwork();
const chainId = normalizeChainId(await rpc('eth_chainId', []));
if (chainId !== network.chainId) throw new Error('Arc Testnet chain mismatch.');
const [transaction, receipt] = await Promise.all([
  rpc('eth_getTransactionByHash', [transactionHash]),
  rpc('eth_getTransactionReceipt', [transactionHash]),
]);
if (!transaction || !receipt || String(transaction.hash).toLowerCase() !== transactionHash || String(receipt.transactionHash).toLowerCase() !== transactionHash) throw new Error('Transaction identity mismatch.');
if (String(transaction.to).toLowerCase() !== network.registryAddress.toLowerCase() || String(transaction.from).toLowerCase() !== expectedPublisher.toLowerCase()) throw new Error('Transaction registry or publisher mismatch.');
if (!['0x1', '1', 1, true].includes(receipt.status)) throw new Error('Transaction receipt reverted.');
const blockNumber = normalizeChainId(receipt.blockNumber);
if (expectedBlock !== null && blockNumber !== expectedBlock) throw new Error('Transaction block mismatch.');
const input = String(transaction.input ?? '').toLowerCase();
if (!input.startsWith(PUBLISH_REPORT_SELECTOR.toLowerCase()) || input.length < 2 + 8 + 64 * 3) throw new Error('Transaction publish selector or calldata is invalid.');
const calldataReportHash = `0x${input.slice(2 + 8 + 64 * 2, 2 + 8 + 64 * 3)}`;
const log = (receipt.logs ?? []).find((candidate) => String(candidate.address).toLowerCase() === network.registryAddress.toLowerCase() && String(candidate.topics?.[0]).toLowerCase() === WEB_REPORT_PUBLISHED_TOPIC.toLowerCase());
if (!log) throw new Error('Trusted Registry V2 publication event is missing.');
const event = decodeWebReportPublishedLog(log);
if (event.publisher.toLowerCase() !== expectedPublisher.toLowerCase() || event.reportHash !== calldataReportHash) throw new Error('Publication event does not match transaction calldata or publisher.');
const accountWord = expectedPublisher.slice(2).toLowerCase().padStart(64, '0');
const duplicateData = `${REGISTRY_HAS_REPORT_SELECTOR}${event.projectId.slice(2)}${accountWord}`;
const duplicateRaw = await rpc('eth_call', [{ to: network.registryAddress, data: duplicateData }, 'latest']);
if (BigInt(duplicateRaw) === 0n) throw new Error('Publisher-scoped registry duplicate is not visible.');

console.log(JSON.stringify({ status: 'already-published', transactionHash, blockNumber, chainId, publisher: expectedPublisher, registryAddress: network.registryAddress, reportHash: `sha256:${event.reportHash.slice(2)}`, receiptVerified: true, eventVerified: true, duplicate: true, transactionSent: false }));
