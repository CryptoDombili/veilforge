import { functionSelector } from '../engine/keccak.js';

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

export function encodePublishReport({ projectId, sourceHash, reportHash, score, reportURI = '', scannerVersion }) {
  const numericScore = Number(score);
  if (!Number.isInteger(numericScore) || numericScore < 0 || numericScore > 100) {
    throw new Error('Score must be an integer between 0 and 100.');
  }
  if (!scannerVersion) throw new Error('scannerVersion is required.');

  const uriTail = encodeDynamicString(reportURI);
  const versionTail = encodeDynamicString(scannerVersion);
  const headSizeBytes = 6 * 32;
  const uriOffset = headSizeBytes;
  const versionOffset = headSizeBytes + uriTail.length / 2;

  const head = [
    requireBytes32(projectId, 'projectId'),
    requireBytes32(sourceHash, 'sourceHash'),
    requireBytes32(reportHash, 'reportHash'),
    padWord(numericScore.toString(16)),
    padWord(uriOffset.toString(16)),
    padWord(versionOffset.toString(16)),
  ].join('');

  return `${PUBLISH_REPORT_SELECTOR}${head}${uriTail}${versionTail}`;
}

export function buildProofPayload(report, reportURI = '') {
  return {
    projectId: report.projectId,
    sourceHash: report.sourceHash,
    reportHash: report.reportHash,
    score: report.score,
    reportURI,
    scannerVersion: report.scannerVersion,
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
    // Some wallets add the network without selecting it. Explicitly switch after add.
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

export async function publishReport({ provider = globalThis.ethereum, registryAddress, account, report, reportURI = '' }) {
  if (!report) throw new Error('Run a scan before publishing a proof.');
  const to = requireAddress(registryAddress, 'Registry address');
  const from = account ?? await connectWallet(provider);
  await ensureArcTestnet(provider);
  const data = encodePublishReport(buildProofPayload(report, reportURI));
  const transactionHash = await provider.request({
    method: 'eth_sendTransaction',
    params: [{ from, to, data, value: '0x0' }],
  });
  return {
    account: from,
    transactionHash,
    explorerUrl: `${ARC_TESTNET.blockExplorerUrls[0]}/tx/${transactionHash}`,
    payload: buildProofPayload(report, reportURI),
  };
}
