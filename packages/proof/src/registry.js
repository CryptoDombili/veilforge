import { functionSelector } from '../../analyzer/src/keccak.js';

export const ARC_TESTNET = Object.freeze({
  chainId: 5_042_002,
  chainIdHex: '0x4CEF52',
  chainName: 'Arc Testnet',
  nativeCurrency: Object.freeze({ name: 'USDC', symbol: 'USDC', decimals: 18 }),
  rpcUrls: Object.freeze(['https://rpc.testnet.arc.network']),
  blockExplorerUrls: Object.freeze(['https://testnet.arcscan.app']),
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

export async function ensureArcTestnet(provider = globalThis.ethereum) {
  if (!provider?.request) throw new Error('No EIP-1193 wallet was detected.');
  const targetChainId = ARC_TESTNET.chainIdHex.toLowerCase();
  const readChainId = async () => String(await provider.request({ method: 'eth_chainId' })).toLowerCase();
  if (await readChainId() === targetChainId) return;

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_TESTNET.chainIdHex }],
    });
  } catch (error) {
    if (walletErrorCode(error) !== 4902) throw error;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: ARC_TESTNET.chainIdHex,
        chainName: ARC_TESTNET.chainName,
        nativeCurrency: ARC_TESTNET.nativeCurrency,
        rpcUrls: [...ARC_TESTNET.rpcUrls],
        blockExplorerUrls: [...ARC_TESTNET.blockExplorerUrls],
      }],
    });
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_TESTNET.chainIdHex }],
    });
  }

  const selectedChainId = await readChainId();
  if (selectedChainId !== targetChainId) {
    throw new Error('The selected wallet did not switch to Arc Testnet. Select Arc Testnet in your wallet and try again.');
  }
}

export async function waitForTransactionReceipt(
  provider,
  transactionHash,
  { pollIntervalMs = 1_000, timeoutMs = 120_000 } = {},
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const receipt = await provider.request({
      method: 'eth_getTransactionReceipt',
      params: [transactionHash],
    });
    if (receipt) return receipt;
    await delay(pollIntervalMs);
  }
  const error = new Error('The proof transaction was submitted but confirmation timed out. Check ArcScan for its final status.');
  error.transactionHash = transactionHash;
  error.explorerUrl = `${ARC_TESTNET.blockExplorerUrls[0]}/tx/${transactionHash}`;
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
}) {
  if (!report) throw new Error('Run a scan before publishing a proof.');
  if (!provider?.request) throw new Error('No EIP-1193 wallet was detected.');

  const to = requireAddress(registryAddress, 'Registry address');
  const from = account ?? await connectWallet(provider);
  await ensureArcTestnet(provider);

  const payload = buildProofPayload(report, reportURI);
  const data = encodePublishReport(payload);
  const transaction = { from, to, data, value: '0x0' };

  // Simulate first so known contract reverts are caught before the wallet spends gas.
  try {
    await provider.request({ method: 'eth_call', params: [transaction, 'latest'] });
  } catch (error) {
    throw new Error(`Proof simulation failed: ${readableWalletError(error)}`);
  }

  const transactionHash = await provider.request({
    method: 'eth_sendTransaction',
    params: [transaction],
  });
  const explorerUrl = `${ARC_TESTNET.blockExplorerUrls[0]}/tx/${transactionHash}`;
  if (typeof onTransactionHash === 'function') onTransactionHash({ transactionHash, explorerUrl });

  const receipt = await waitForTransactionReceipt(provider, transactionHash, {
    pollIntervalMs,
    timeoutMs: receiptTimeoutMs,
  });

  if (!receiptSucceeded(receipt.status)) {
    const error = new Error('The proof transaction was mined but reverted on Arc Testnet.');
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
