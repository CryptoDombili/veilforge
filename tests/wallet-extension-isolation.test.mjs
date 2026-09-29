import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWorkerMessage } from '../apps/web/v4/runtime/protocol.js';
import { createWorkerClient } from '../apps/web/v4/runtime/worker-client.js';
import { discoverWalletProviders } from '../apps/web/v4/wallet-provider-discovery.js';
import { connectProofWalletChoiceFromUserClick, discoverProofWalletChoices, walletChoicesTemplate } from '../apps/web/v4/ui.js';
import { deriveProofWalletUiState, proofSectionTemplate } from '../apps/web/v4/proof-ui.js';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const CLICK = Object.freeze({ type: 'click', isTrusted: true });

function connectableProvider(chainId = '0x13b2') {
  const calls = [];
  return {
    calls,
    async request({ method }) {
      calls.push(method);
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [ACCOUNT];
      if (method === 'eth_chainId') return chainId;
      throw new Error('Unexpected wallet method');
    },
  };
}

const provider = (name) => ({ name, async request() { return []; } });

class ScanWorker {
  constructor() {
    queueMicrotask(() => this.onmessage?.({ data: createWorkerMessage('ready', 'worker', { available: true }) }));
  }

  postMessage(message) {
    if (message.messageType === 'scan-request') {
      queueMicrotask(() => this.onmessage?.({ data: createWorkerMessage('result', message.requestId, { result: { verified: true } }) }));
    }
  }

  terminate() {}
}

async function localScan(walletEnvironment) {
  const before = walletEnvironment.snapshot();
  const client = createWorkerClient({ workerFactory: () => new ScanWorker() });
  try {
    assert.deepEqual(await client.scan({ projectId: 'wallet-isolated-scan' }, { requestId: 'wallet-isolated-request' }), { verified: true });
  } finally { client.dispose(); }
  assert.deepEqual(walletEnvironment.snapshot(), before, 'scanner must not inspect or subscribe to wallet state');
}

function walletScope({ announcements = [], legacyProvider = null, throwingEthereum = false } = {}) {
  const listeners = new Map();
  let currentLegacy = legacyProvider;
  const metrics = { ethereumReads: 0, listenersAdded: 0, requests: 0 };
  const scope = {
    Event: class { constructor(type) { this.type = type; } },
    addEventListener(type, listener) {
      metrics.listenersAdded += 1;
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    dispatchEvent(event) {
      if (event?.type !== 'eip6963:requestProvider') return true;
      metrics.requests += 1;
      for (const detail of announcements) {
        for (const listener of listeners.get('eip6963:announceProvider') ?? []) listener({ type: 'eip6963:announceProvider', detail });
      }
      return true;
    },
  };
  Object.defineProperty(scope, 'ethereum', {
    configurable: true,
    get() {
      metrics.ethereumReads += 1;
      if (throwingEthereum) throw new Error('extension getter failure');
      return currentLegacy;
    },
  });
  return Object.freeze({
    scope,
    setLegacyProvider(value) { currentLegacy = value; },
    snapshot() { return { ...metrics }; },
  });
}

test('local V4 scanner is independent from absent, single, multiple, throwing and late wallet providers', async (t) => {
  await t.test('no window.ethereum', () => localScan(walletScope()));
  await t.test('one mocked wallet provider', () => localScan(walletScope({ legacyProvider: provider('legacy') })));
  await t.test('multiple EIP-6963 providers', () => localScan(walletScope({ announcements: [
    { info: { name: 'MetaMask', rdns: 'io.metamask', uuid: 'one' }, provider: provider('metamask') },
    { info: { name: 'Rabby', rdns: 'io.rabby', uuid: 'two' }, provider: provider('rabby') },
  ] })));
  await t.test('provider getter throws', () => localScan(walletScope({ throwingEthereum: true })));
  await t.test('wallet provider appears after page load', async () => {
    const environment = walletScope();
    await localScan(environment);
    environment.setLegacyProvider(provider('late-provider'));
    await localScan(environment);
  });
});

test('wallet discovery is deferred and combines EIP-6963 announcements with legacy providers', async () => {
  const metamask = provider('metamask');
  const rabby = provider('rabby');
  const legacy = provider('legacy-conflict');
  const environment = walletScope({
    legacyProvider: legacy,
    announcements: [
      { info: { name: 'Rabby Wallet', rdns: 'io.rabby', uuid: 'two' }, provider: rabby },
      { info: { name: 'MetaMask', rdns: 'io.metamask', uuid: 'one' }, provider: metamask },
    ],
  });
  assert.deepEqual(environment.snapshot(), { ethereumReads: 0, listenersAdded: 0, requests: 0 });
  const discovered = await discoverWalletProviders({ scope: environment.scope, waitMs: 0 });
  assert.deepEqual(discovered.map((item) => item.provider), [metamask, rabby, legacy]);
  assert.deepEqual(environment.snapshot(), { ethereumReads: 1, listenersAdded: 1, requests: 1 });
});

test('wallet discovery tolerates a throwing provider getter and a provider injected later', async () => {
  const broken = walletScope({ throwingEthereum: true });
  assert.deepEqual(await discoverWalletProviders({ scope: broken.scope, waitMs: 0 }), []);
  const late = walletScope();
  assert.deepEqual(await discoverWalletProviders({ scope: late.scope, waitMs: 0 }), []);
  const injected = provider('late');
  late.setLegacyProvider(injected);
  assert.equal((await discoverWalletProviders({ scope: late.scope, waitMs: 0 }))[0].provider, injected);
});

test('proof render and local scan never request an account; click discovers a late wallet exactly once', async () => {
  const injected = connectableProvider();
  const environment = walletScope();
  assert.match(proofSectionTemplate(), /id="v4-proof-inspect-wallet"/u);
  const initial = deriveProofWalletUiState({}, 5_042, { networkKey: 'arc-mainnet' });
  assert.equal(initial.label, 'Connect Wallet');
  assert.equal(initial.disabled, false);
  await localScan(environment);
  assert.deepEqual(injected.calls, []);
  assert.deepEqual(environment.snapshot(), { ethereumReads: 0, listenersAdded: 0, requests: 0 });
  environment.setLegacyProvider(injected);
  let savedProvider = null;
  const choices = await discoverProofWalletChoices({ scope: environment.scope, waitMs: 0 });
  assert.equal(choices.length, 1);
  const connected = await connectProofWalletChoiceFromUserClick(CLICK, choices[0], { onProvider(value) { savedProvider = value; } });
  assert.equal(savedProvider, injected);
  assert.equal(connected.provider, injected);
  assert.equal(connected.connection.account, ACCOUNT);
  assert.deepEqual(injected.calls, ['eth_requestAccounts']);
  const mainnet = deriveProofWalletUiState({ providerAvailable: true, connected: true, account: ACCOUNT, chainId: 5_042 }, 5_042, { networkKey: 'arc-mainnet' });
  assert.equal(mainnet.state, 'connected');
  assert.match(mainnet.description, /Arc Mainnet chain 5042/u);
});

test('explicit click safely falls back to a legacy provider injected during discovery', async () => {
  const injected = connectableProvider();
  let reads = 0;
  const scope = { get ethereum() { reads += 1; return reads > 1 ? injected : null; } };
  const choices = await discoverProofWalletChoices({ scope, waitMs: 0 });
  const connected = await connectProofWalletChoiceFromUserClick(CLICK, choices[0]);
  assert.equal(connected.provider, injected);
  assert.ok(reads >= 2);
  assert.deepEqual(injected.calls, ['eth_requestAccounts']);
});

test('multiple wallets present an explicit chooser and never auto-connect the first sorted provider', async () => {
  const metamask = connectableProvider();
  const rabby = connectableProvider();
  const keplr = connectableProvider();
  const environment = walletScope({ announcements: [
    { info: { name: 'Rabby Wallet', rdns: 'io.rabby', uuid: 'two' }, provider: rabby },
    { info: { name: 'MetaMask', rdns: 'io.metamask', uuid: 'one' }, provider: metamask },
  ] });
  environment.scope.keplr = { ethereum: keplr };
  const choices = await discoverProofWalletChoices({ scope: environment.scope, waitMs: 0 });
  assert.deepEqual(choices.map((item) => item.info.name), ['MetaMask', 'Rabby Wallet', 'Keplr EVM']);
  assert.match(walletChoicesTemplate(choices), /Choose wallet/u);
  assert.match(walletChoicesTemplate(choices), /MetaMask/u);
  assert.match(walletChoicesTemplate(choices), /Rabby Wallet/u);
  assert.match(walletChoicesTemplate(choices), /Keplr EVM/u);
  assert.deepEqual(metamask.calls, []);
  assert.deepEqual(rabby.calls, []);
  assert.deepEqual(keplr.calls, []);
  const connected = await connectProofWalletChoiceFromUserClick(CLICK, choices.find((item) => item.provider === metamask));
  assert.equal(connected.provider, metamask);
  assert.deepEqual(metamask.calls, ['eth_requestAccounts']);
  assert.deepEqual(rabby.calls, []);
  assert.deepEqual(keplr.calls, []);
  await connectProofWalletChoiceFromUserClick(CLICK, choices.find((item) => item.provider === rabby));
  assert.deepEqual(rabby.calls, ['eth_requestAccounts']);
  assert.deepEqual(keplr.calls, []);
  await connectProofWalletChoiceFromUserClick(CLICK, choices.find((item) => item.provider === keplr));
  assert.deepEqual(keplr.calls, ['eth_requestAccounts']);
});

test('each single EVM wallet connects after one explicit click, including Keplr and Rabby', async () => {
  for (const [name, environmentFactory] of [
    ['MetaMask', (wallet) => walletScope({ announcements: [{ info: { name: 'MetaMask', rdns: 'io.metamask', uuid: 'one' }, provider: wallet }] })],
    ['Rabby', (wallet) => walletScope({ announcements: [{ info: { name: 'Rabby', rdns: 'io.rabby', uuid: 'two' }, provider: wallet }] })],
    ['Keplr EVM', (wallet) => { const environment = walletScope(); environment.scope.keplr = { ethereum: wallet }; return environment; }],
  ]) {
    const wallet = connectableProvider();
    const environment = environmentFactory(wallet);
    const choices = await discoverProofWalletChoices({ scope: environment.scope, waitMs: 0 });
    assert.equal(choices.length, 1, name);
    assert.equal(choices[0].info.name, name);
    assert.deepEqual(wallet.calls, []);
    await connectProofWalletChoiceFromUserClick(CLICK, choices[0]);
    assert.deepEqual(wallet.calls, ['eth_requestAccounts']);
  }
});

test('legacy window.ethereum.providers and Phantom EVM remain discoverable alongside Keplr', async () => {
  const first = connectableProvider();
  const second = connectableProvider();
  const keplr = connectableProvider();
  const phantom = connectableProvider();
  const environment = walletScope({ legacyProvider: { providers: [first, second] } });
  environment.scope.keplr = { ethereum: keplr };
  environment.scope.phantom = { ethereum: phantom };
  const choices = await discoverProofWalletChoices({ scope: environment.scope, waitMs: 0 });
  assert.deepEqual(new Set(choices.map((item) => item.provider)), new Set([first, second, keplr, phantom]));
  assert.match(walletChoicesTemplate(choices), /Keplr EVM/u);
  assert.match(walletChoicesTemplate(choices), /Phantom/u);
  for (const wallet of [first, second, keplr, phantom]) assert.deepEqual(wallet.calls, []);
});

test('duplicate announcements collapse and hostile wallet metadata is escaped', async () => {
  const wallet = connectableProvider();
  const another = connectableProvider();
  const environment = walletScope({ announcements: [
    { info: { name: '<img src=x onerror=alert(1)>', rdns: 'io.example', uuid: 'one' }, provider: wallet },
    { info: { name: '<img src=x onerror=alert(1)>', rdns: 'io.example', uuid: 'one' }, provider: wallet },
    { info: { name: 'Rabby', rdns: 'io.rabby', uuid: 'two' }, provider: another },
  ] });
  const choices = await discoverProofWalletChoices({ scope: environment.scope, waitMs: 0 });
  assert.equal(choices.length, 2);
  const html = walletChoicesTemplate(choices);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/u);
  assert.doesNotMatch(html, /<img/u);
  assert.doesNotMatch(html, /\[object Object\]/u);
  assert.deepEqual(wallet.calls, []);
  assert.deepEqual(another.calls, []);
});

test('no wallet gives a safe retry; an untrusted event never opens a wallet; wrong chain remains blocked', async () => {
  const empty = walletScope();
  const emptyChoices = await discoverProofWalletChoices({ scope: empty.scope, waitMs: 0 });
  await assert.rejects(() => connectProofWalletChoiceFromUserClick(CLICK, emptyChoices[0]), (error) => error.code === 'WEB_V4_PROVIDER_UNAVAILABLE');
  const retry = deriveProofWalletUiState({}, 5_042, { error: 'No injected EVM wallet was found. Install or enable MetaMask/Rabby and retry.', networkKey: 'arc-mainnet' });
  assert.equal(retry.label, 'Retry wallet connection');
  assert.equal(retry.disabled, false);
  const injected = connectableProvider();
  const present = walletScope({ legacyProvider: injected });
  const presentChoices = await discoverProofWalletChoices({ scope: present.scope, waitMs: 0 });
  await assert.rejects(() => connectProofWalletChoiceFromUserClick({ type: 'click', isTrusted: false }, presentChoices[0]), (error) => error.code === 'WEB_V4_USER_GESTURE_REQUIRED');
  assert.deepEqual(injected.calls, []);
  const wrong = deriveProofWalletUiState({ providerAvailable: true, connected: true, account: ACCOUNT, chainId: 1 }, 5_042, { networkKey: 'arc-mainnet' });
  assert.equal(wrong.label, 'Wrong network · switch in wallet');
  assert.equal(wrong.disabled, true);
});

test('startup and scanner code never redefine or eagerly read window.ethereum', () => {
  const app = fs.readFileSync(new URL('../apps/web/app.js', import.meta.url), 'utf8');
  const ui = fs.readFileSync(new URL('../apps/web/v4/ui.js', import.meta.url), 'utf8');
  const discovery = fs.readFileSync(new URL('../apps/web/v4/wallet-provider-discovery.js', import.meta.url), 'utf8');
  const worker = fs.readFileSync(new URL('../apps/web/v4/runtime/worker-client.js', import.meta.url), 'utf8');
  const init = app.slice(app.indexOf('async function init()'), app.indexOf('\ninit();'));
  const initializeProof = ui.slice(ui.indexOf('const initializeProof'), ui.indexOf('const inspectProofWallet'));
  const forbiddenRedefinition = /(?:defineProperty\s*\([^)]*(?:window|globalThis)[^)]*ethereum|(?:window|globalThis)\.ethereum\s*=)/u;
  for (const source of [app, ui, discovery]) assert.doesNotMatch(source, forbiddenRedefinition);
  assert.doesNotMatch(init, /requestAnnouncedProviders|hydrateWallet|eip6963:requestProvider/u);
  assert.doesNotMatch(initializeProof, /inspectProofWallet|ethereum/u);
  assert.doesNotMatch(worker, /(?:window|globalThis)\.ethereum|eip6963/u);
  assert.doesNotMatch(ui, /globalThis\.ethereum/u);
});

test('Vercel Preview feedback script remains outside the strict VeilForge CSP boundary', () => {
  const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const csp = vercel.headers.flatMap((rule) => rule.headers).find((header) => header.key === 'Content-Security-Policy')?.value ?? '';
  const note = fs.readFileSync(new URL('../docs/security/vercel-preview-feedback-csp.md', import.meta.url), 'utf8');
  assert.match(csp, /script-src 'self'/u);
  assert.match(csp, /script-src[^;]*'wasm-unsafe-eval'/u);
  assert.doesNotMatch(csp, /_next-live|'unsafe-eval'|script-src[^;]*\*/u);
  assert.match(note, /Vercel Preview toolbar\/feedback tooling/u);
  assert.match(note, /not loaded, imported, bundled, or required by the VeilForge runtime/u);
});
