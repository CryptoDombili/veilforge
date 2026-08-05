import { report } from '../../v4/report/helpers.mjs';
import { createWebProofEnvelope, prepareWebRegistryPublish } from '../../../apps/web/v4/proof-adapter.js';
import { WEB_REPORT_PUBLISHED_TOPIC } from '../../../apps/web/v4/proof-receipt.js';
import { verifyV4Report } from '../../../apps/web/v4/report-adapter.js';

export const ACCOUNT = '0x1111111111111111111111111111111111111111';
export const OTHER_ACCOUNT = '0x2222222222222222222222222222222222222222';
export const TX_HASH = `0x${'ab'.repeat(32)}`;

export function currentReport(overrides = {}) { return report(overrides); }
export function incompleteReport() { return report({ analysis: { statuses: { frontend: 'complete', ir: 'incomplete' }, incompleteReasons: ['unsupported-expression'] } }); }
export async function verification(value = currentReport()) { return verifyV4Report(value); }
export async function envelope(value) { return createWebProofEnvelope(await verification(value)); }
export async function readyProof(options = {}) {
  const verified = await verification(options.report ?? currentReport());
  const proofEnvelope = await createWebProofEnvelope(verified);
  const walletState = options.walletState ?? { providerAvailable: true, connected: true, account: ACCOUNT, accounts: [ACCOUNT], chainId: 5_042_002 };
  const preflight = await prepareWebRegistryPublish({ verification: verified, envelope: proofEnvelope, walletState, disclosureAcknowledged: options.disclosureAcknowledged ?? true, existingRecord: options.existingRecord ?? null });
  return { verification: verified, envelope: proofEnvelope, walletState, preflight };
}

export function mockProvider({ accounts = [ACCOUNT], chainId = '0x4cef52', errors = {} } = {}) {
  const calls = [];
  const listeners = new Map();
  return {
    calls,
    listeners,
    async request({ method }) {
      calls.push(method);
      if (errors[method]) throw errors[method];
      if (method === 'eth_accounts') return accounts;
      if (method === 'eth_chainId') return chainId;
      throw new Error('unsupported');
    },
    on(event, handler) { const values = listeners.get(event) ?? []; values.push(handler); listeners.set(event, values); },
    removeListener(event, handler) { listeners.set(event, (listeners.get(event) ?? []).filter((item) => item !== handler)); },
    emit(event, value) { for (const handler of listeners.get(event) ?? []) handler(value); },
  };
}

function padWord(hex) { return hex.padStart(64, '0'); }
function stringTail(value) {
  const body = Buffer.from(value, 'utf8').toString('hex');
  return `${padWord((body.length / 2).toString(16))}${body.padEnd(Math.ceil(body.length / 64) * 64, '0')}`;
}

export function publicationLog(proofEnvelope, preflight, { account = ACCOUNT, address = proofEnvelope.registryAddress, reportHash = preflight.payload.reportHash, reportURI = '' } = {}) {
  const scannerTail = stringTail(preflight.payload.scannerVersion);
  const uriTail = stringTail(reportURI);
  const uriOffset = 128 + scannerTail.length / 2;
  return {
    address,
    topics: [WEB_REPORT_PUBLISHED_TOPIC, preflight.payload.projectId, preflight.payload.sourceHash, reportHash],
    data: `0x${padWord('0')}${padWord('80')}${padWord(uriOffset.toString(16))}${padWord(account.slice(2).toLowerCase())}${scannerTail}${uriTail}`,
  };
}

export function receipt(proofEnvelope, preflight, overrides = {}) {
  return { status: '0x1', transactionHash: TX_HASH, blockNumber: '0x10', from: ACCOUNT, logs: [publicationLog(proofEnvelope, preflight)], ...overrides };
}

export function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key(index) { return [...map.keys()][index] ?? null; },
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    value(key) { return map.get(key); },
  };
}
