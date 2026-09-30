import { report } from '../../v4/report/helpers.mjs';
import { createWebProofEnvelope, prepareWebRegistryPublish } from '../../../apps/web/v4/proof-adapter.js';
import { WEB_REPORT_PUBLISHED_TOPIC } from '../../../apps/web/v4/proof-receipt.js';
import { verifyV4Report } from '../../../apps/web/v4/report-adapter.js';
import { resolveProofNetwork } from '../../../packages/proof/v4/network.js';
import { createProofSendCoordinator } from '../../../apps/web/v4/proof-send-coordinator.js';

export const ACCOUNT = '0x1111111111111111111111111111111111111111';
export const OTHER_ACCOUNT = '0x2222222222222222222222222222222222222222';
export const TX_HASH = `0x${'ab'.repeat(32)}`;

export function currentReport(overrides = {}) { return report(overrides); }
export function incompleteReport() { return report({ analysis: { statuses: { frontend: 'complete', ir: 'incomplete' }, incompleteReasons: ['unsupported-expression'] } }); }
export async function verification(value = currentReport()) { return verifyV4Report(value); }
export async function envelope(value) { return createWebProofEnvelope(await verification(value)); }
export async function readyProof(options = {}) {
  const verified = await verification(options.report ?? currentReport());
  const networkKey = options.networkKey ?? 'arc-testnet';
  const network = resolveProofNetwork(networkKey);
  const proofEnvelope = await createWebProofEnvelope(verified, { networkKey });
  const walletState = options.walletState ?? { providerAvailable: true, connected: true, account: ACCOUNT, accounts: [ACCOUNT], chainId: network.chainId };
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

export function registryRecordResult(payload, { account = ACCOUNT, publishedAt = 1_700_000_000 } = {}) {
  const scannerTail = stringTail(payload.scannerVersion);
  const uriTail = stringTail(payload.reportURI ?? '');
  const uriOffset = 224 + scannerTail.length / 2;
  const tuple = `${payload.sourceHash.slice(2)}${payload.reportHash.slice(2)}${padWord(Number(payload.score).toString(16))}${padWord('e0')}${padWord(uriOffset.toString(16))}${padWord(account.slice(2).toLowerCase())}${padWord(publishedAt.toString(16))}${scannerTail}${uriTail}`;
  return `0x${padWord('20')}${tuple}`;
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

export function proofSendCoordinationEnvironment() {
  const storage = memoryStorage();
  const queues = new Map();
  const locks = {
    request(name, _options, callback) {
      const previous = queues.get(name) ?? Promise.resolve();
      let release;
      const current = new Promise((resolve) => { release = resolve; });
      queues.set(name, current);
      return previous.then(callback).finally(() => {
        release();
        if (queues.get(name) === current) queues.delete(name);
      });
    },
  };
  return { storage, locks };
}

export function testProofSendCoordinator(environment = proofSendCoordinationEnvironment(), options = {}) {
  return createProofSendCoordinator({
    ...environment,
    ownerId: options.ownerId ?? `test-owner-${Math.random()}`,
    now: options.now,
    leaseMs: options.leaseMs,
  });
}
