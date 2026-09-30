import { functionSelector } from '../../analyzer/src/keccak.js';
import {
  assertProofNetworkCapability,
  assertTrustedNetwork,
  DEFAULT_PROOF_NETWORK,
  resolveProofNetwork,
} from '../v4/network.js';

const testnetProfile = resolveProofNetwork(DEFAULT_PROOF_NETWORK);
export const ARC_TESTNET = Object.freeze({
  chainId: testnetProfile.chainId,
  chainIdHex: testnetProfile.chainIdHex.toUpperCase().replace('0X', '0x'),
  chainName: testnetProfile.chainName,
  nativeCurrency: testnetProfile.nativeCurrency,
  rpcUrls: testnetProfile.rpcUrls,
  blockExplorerUrls: testnetProfile.blockExplorerUrls,
});

export const PUBLISH_REPORT_SIGNATURE = 'publishReport(bytes32,bytes32,bytes32,uint16,string,string)';
export const PUBLISH_REPORT_SELECTOR = functionSelector(PUBLISH_REPORT_SIGNATURE);

function stripHexPrefix(value) {
  return String(value).replace(/^0x/i, '');
}

function padWord(value) {
  const hex = stripHexPrefix(value);
  if (hex.length > 64) throw new Error('ABI word exceeds 32 bytes.');
  return hex.padStart(64, '0');
}

function padRightToWord(value) {
  const remainder = value.length % 64;
  return remainder === 0 ? value : value.padEnd(value.length + (64 - remainder), '0');
}

function utf8Hex(value) {
  return [...new TextEncoder().encode(String(value))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function encodeDynamicString(value) {
  const body = utf8Hex(value);
  const byteLength = body.length / 2;
  return `${padWord(byteLength.toString(16))}${padRightToWord(body)}`;
}

function requireBytes32(value, field) {
  const hex = stripHexPrefix(value);
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error(`${field} must be a 32-byte hex value.`);
  return hex.toLowerCase();
}

function requireAddress(value, field = 'Address') {
  const address = String(value ?? '');
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error(`${field} is not a valid EVM address.`);
  return address;
}

function requireScannerVersion(value) {
  const version = String(value ?? '').trim();
  if (!version) throw new Error('scannerVersion is required. Run a fresh scan before publishing.');
  return version;
}

function receiptSucceeded(status) {
  if (status === true || status === 1 || status === '1') return true;
  if (typeof status === 'string') return Number.parseInt(status, 16) === 1;
  return false;
}

function readableWalletError(error) {
  const candidates = [
    error?.shortMessage,
    error?.message,
    error?.data?.message,
    error?.data?.originalError?.message,
    error?.cause?.message,
  ];
  const message = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
  return message ? message.replace(/^Error:\s*/i, '').trim() : 'The wallet rejected or could not complete the request.';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Encode the live Arc registry ABI.
 * The deployed registry expects scannerVersion before reportURI.
 * Both parameters are strings, so changing their semantic order does not
 * change the function selector; it only changes the dynamic ABI offsets.
 */
export function encodePublishReport({ projectId, sourceHash, reportHash, score, scannerVersion, reportURI = '' }) {
  const numericScore = Number(score);
  if (!Number.isInteger(numericScore) || numericScore < 0 || numericScore > 100) {
    throw new Error('Score must be an integer between 0 and 100.');
  }

  const version = requireScannerVersion(scannerVersion);
  const versionTail = encodeDynamicString(version);
  const uriTail = encodeDynamicString(reportURI);
  const headSizeBytes = 6 * 32;
  const versionOffset = headSizeBytes;
  const uriOffset = headSizeBytes + versionTail.length / 2;

  const head = [
    requireBytes32(projectId, 'projectId'),
    requireBytes32(sourceHash, 'sourceHash'),
    requireBytes32(reportHash, 'reportHash'),
    padWord(numericScore.toString(16)),
    padWord(versionOffset.toString(16)),
    padWord(uriOffset.toString(16)),
  ].join('');

  return `${PUBLISH_REPORT_SELECTOR}${head}${versionTail}${uriTail}`;
}

function decodeCanonicalString(body, offset, field) {
  if (!Number.isSafeInteger(offset) || offset < 192 || offset % 32 !== 0) throw new Error(`${field} offset is invalid.`);
  const start = offset * 2;
  if (start + 64 > body.length) throw new Error(`${field} offset exceeds calldata.`);
  const length = Number(BigInt(`0x${body.slice(start, start + 64)}`));
  if (!Number.isSafeInteger(length) || length < 0 || length > 4_096) throw new Error(`${field} length is invalid.`);
  const valueStart = start + 64;
  const valueEnd = valueStart + length * 2;
  const paddedEnd = valueStart + Math.ceil(length / 32) * 64;
  if (valueEnd > body.length || paddedEnd > body.length || !/^0*$/u.test(body.slice(valueEnd, paddedEnd))) throw new Error(`${field} encoding is invalid.`);
  try {
    const bytes = Uint8Array.from(body.slice(valueStart, valueEnd).match(/../gu) ?? [], (byte) => Number.parseInt(byte, 16));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${field} is not valid UTF-8.`);
  }
}

export function decodeCanonicalPublishReportCalldata(value) {
  const data = String(value ?? '').toLowerCase();
  if (!/^0x[0-9a-f]+$/u.test(data) || data.length % 2 !== 0 || !data.startsWith(PUBLISH_REPORT_SELECTOR)) throw new Error('Calldata does not use the canonical publishReport selector.');
  const body = data.slice(PUBLISH_REPORT_SELECTOR.length);
  if (body.length < 64 * 6) throw new Error('publishReport calldata is incomplete.');
  const words = body.slice(0, 64 * 6).match(/.{64}/gu);
  if (!words || words.length !== 6) throw new Error('publishReport calldata head is invalid.');
  const score = Number(BigInt(`0x${words[3]}`));
  if (!Number.isSafeInteger(score) || score < 0 || score > 100) throw new Error('publishReport score is invalid.');
  const scannerVersion = decodeCanonicalString(body, Number(BigInt(`0x${words[4]}`)), 'scannerVersion');
  const reportURI = decodeCanonicalString(body, Number(BigInt(`0x${words[5]}`)), 'reportURI');
  const payload = {
    projectId: `0x${words[0]}`,
    sourceHash: `0x${words[1]}`,
    reportHash: `0x${words[2]}`,
    score,
    scannerVersion,
    reportURI,
  };
  if (encodePublishReport(payload).toLowerCase() !== data) throw new Error('publishReport calldata is not canonically encoded.');
  return Object.freeze(payload);
}

export function buildProofPayload(report, reportURI = '') {
  if (!report) throw new Error('Run a scan before building a proof payload.');
  return {
    projectId: report.projectId,
    sourceHash: report.sourceHash,
    reportHash: report.reportHash,
    score: report.score,
    scannerVersion: requireScannerVersion(report.scannerVersion),
    reportURI,
  };
}

export async function connectWallet(provider = globalThis.ethereum) {
  if (!provider?.request) throw new Error('No EIP-1193 wallet was detected. Install or unlock a compatible wallet.');
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const account = accounts?.[0];
  if (!account) throw new Error('The wallet did not return an account.');
  return account;
}

function walletErrorCode(error) {
  const candidates = [
    error?.code,
    error?.data?.code,
    error?.data?.originalError?.code,
    error?.cause?.code,
  ];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

export async function ensureProofNetwork(networkKey = DEFAULT_PROOF_NETWORK, provider = globalThis.ethereum) {
  const network = assertProofNetworkCapability(networkKey, 'publish');
  if (!provider?.request) throw new Error('No EIP-1193 wallet was detected.');
  const walletChainIdHex = network.networkKey === DEFAULT_PROOF_NETWORK ? ARC_TESTNET.chainIdHex : network.chainIdHex;
  const targetChainId = walletChainIdHex.toLowerCase();
  const readChainId = async () => String(await provider.request({ method: 'eth_chainId' })).toLowerCase();
  if (await readChainId() === targetChainId) return;

  if (network.environment === 'mainnet') {
    throw new Error(`${network.chainName} must be selected manually and is not available for proof publishing.`);
  }

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: walletChainIdHex }],
    });
  } catch (error) {
    if (walletErrorCode(error) !== 4902) throw error;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: walletChainIdHex,
        chainName: network.chainName,
        nativeCurrency: network.nativeCurrency,
        rpcUrls: [...network.rpcUrls],
        blockExplorerUrls: [...network.blockExplorerUrls],
      }],
    });
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: walletChainIdHex }],
    });
  }

  const selectedChainId = await readChainId();
  if (selectedChainId !== targetChainId) {
    throw new Error(`The selected wallet did not switch to ${network.chainName}. Select ${network.chainName} in your wallet and try again.`);
  }
}

export async function ensureArcTestnet(provider = globalThis.ethereum) {
  return ensureProofNetwork(DEFAULT_PROOF_NETWORK, provider);
}

export async function waitForTransactionReceipt(
  provider,
  transactionHash,
  { pollIntervalMs = 1_000, timeoutMs = 120_000, networkKey = DEFAULT_PROOF_NETWORK } = {},
) {
  const network = assertProofNetworkCapability(networkKey, 'read');
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const receipt = await provider.request({
      method: 'eth_getTransactionReceipt',
      params: [transactionHash],
    });
    if (receipt) return receipt;
    await delay(pollIntervalMs);
  }
  const error = new Error(`The proof transaction was submitted but confirmation timed out. Check ${network.chainName}'s explorer for its final status.`);
  error.transactionHash = transactionHash;
  error.explorerUrl = `${network.explorerBaseUrl}/tx/${transactionHash}`;
  throw error;
}

export async function publishReport({
  provider = globalThis.ethereum,
  registryAddress,
  account,
  report,
  reportURI = '',
  onTransactionHash,
  pollIntervalMs = 1_000,
  receiptTimeoutMs = 120_000,
  networkKey = DEFAULT_PROOF_NETWORK,
  userApproved = false,
}) {
  if (!report) throw new Error('Run a scan before publishing a proof.');
  if (userApproved !== true) throw new Error('Explicit user approval is required before proof publication.');
  const network = assertProofNetworkCapability(networkKey, 'publish');
  if (!provider?.request) throw new Error('No EIP-1193 wallet was detected.');

  const to = requireAddress(registryAddress, 'Registry address');
  if (to.toLowerCase() !== network.registryAddress.toLowerCase()) throw new Error(`Registry address does not match trusted ${network.chainName} configuration.`);
  const from = account ?? await connectWallet(provider);
  await ensureProofNetwork(networkKey, provider);

  const payload = buildProofPayload(report, reportURI);
  const data = encodePublishReport(payload);
  const transaction = { from, to, data, value: '0x0' };

  // Simulate first so known contract reverts are caught before the wallet spends gas.
  try {
    await provider.request({ method: 'eth_call', params: [transaction, 'latest'] });
  } catch (error) {
    throw new Error(`Proof simulation failed: ${readableWalletError(error)}`);
  }

  const providerChainId = await provider.request({ method: 'eth_chainId' });
  assertTrustedNetwork({ networkKey, providerChainId, registryAddress: transaction.to, operation: 'publish' });
  const transactionHash = await provider.request({
    method: 'eth_sendTransaction',
    params: [transaction],
  });
  const explorerUrl = `${network.explorerBaseUrl}/tx/${transactionHash}`;
  if (typeof onTransactionHash === 'function') onTransactionHash({ transactionHash, explorerUrl });

  const receipt = await waitForTransactionReceipt(provider, transactionHash, {
    pollIntervalMs,
    timeoutMs: receiptTimeoutMs,
    networkKey,
  });

  if (!receiptSucceeded(receipt.status)) {
    const error = new Error(`The proof transaction was mined but reverted on ${network.chainName}.`);
    error.transactionHash = transactionHash;
    error.explorerUrl = explorerUrl;
    error.receipt = receipt;
    throw error;
  }

  return {
    account: from,
    transactionHash,
    explorerUrl,
    receipt,
    confirmed: true,
    payload,
  };
}
