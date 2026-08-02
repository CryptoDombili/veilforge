import {
  compareReports,
  formatMarkdownReport,
  generatePolicyManifest,
  scanProject,
  applyForgeCandidates,
  evaluateDeploymentEvidence,
  keccakHex,
} from './engine/index.js';
import {
  ARC_TESTNET,
  buildProofPayload,
  connectWallet,
  ensureArcTestnet,
  publishReport,
} from './proof/registry.js';
import { createZip } from './lib/zip.js';
import { looksLikeSolidity, readZipEntries } from './lib/unzip.js';
import { analyzeProject } from './lib/project-xray.js';
import {
  EIP1967_IMPLEMENTATION_SLOT,
  assertRpcChainId,
  implementationAddressFromStorage,
  parseBytecodeArtifact,
  verifyBytecodeTruth,
} from './lib/bytecode-truth.js';
import { buildProofLabSnapshot, parseProofLabReceipt } from './lib/proof-lab.js';
import { REGISTRY_ADDRESS } from './config.js';

const HISTORY_KEY = 'veilforge:v3.2:scan-history';
const MAX_HISTORY = 12;
const WALLET_DISCONNECTED_KEY = 'veilforge:v3.2:wallet-disconnected';
const INTENT_KEY = 'veilforge:v3.2:privacy-intent';
const DEPLOYMENT_EVIDENCE_KEY = 'veilforge:v3.2:deployment-evidence';
let detectorClearTimer = null;
const DEFAULT_INTENT_DECLARATION = Object.freeze({
  defaults: Object.freeze({ publicObserver: 'denied', externalContract: 'restricted', recordOwner: 'allowed' }),
  controls: Object.freeze({ requireLeastPrivilege: true, requireRevocationPath: true, prohibitSensitiveRevertData: true, requireDeploymentLineage: true }),
});

const state = {
  files: [],
  projectFiles: [],
  projectXray: null,
  report: null,
  baseline: null,
  activeView: 'triage',
  walletAccount: null,
  walletProvider: null,
  walletProviderInfo: null,
  history: readHistory(),
  filters: { query: '', severity: 'all', policy: 'all' },
  intentDeclaration: readIntentDeclaration(),
  deploymentEvidence: readDeploymentEvidence(),
  activeReplayId: null,
  replayTimer: null,
  bytecodeTruth: { artifact: null, artifactFileName: '', verification: null, error: null },
  proofLab: { receipt: null, receiptFileName: '', snapshot: null, error: null },
};

const elements = {
  projectName: document.querySelector('#project-name'),
  fileInput: document.querySelector('#file-input'),
  folderInput: document.querySelector('#folder-input'),
  dropZone: document.querySelector('#drop-zone'),
  fileList: document.querySelector('#file-list'),
  clearFiles: document.querySelector('#clear-files'),
  scanButton: document.querySelector('#scan-button'),
  scanMessage: document.querySelector('#scan-message'),
  missionSummary: document.querySelector('#mission-summary'),
  workspace: document.querySelector('#workspace'),
  scanVisualizer: document.querySelector('#scan-visualizer'),
  detectorFindings: document.querySelector('#detector-findings'),
  detectorSeveritySummary: document.querySelector('#detector-severity-summary'),
  walletButton: document.querySelector('#header-wallet-button'),
  walletLabel: document.querySelector('#header-wallet-label'),
  walletBackdrop: document.querySelector('#wallet-backdrop'),
  walletMenu: document.querySelector('#wallet-menu'),
  walletMenuClose: document.querySelector('#wallet-menu-close'),
  walletMenuAddress: document.querySelector('#wallet-menu-address'),
  walletCopyAddress: document.querySelector('#wallet-copy-address'),
  walletViewExplorer: document.querySelector('#wallet-view-explorer'),
  walletDisconnect: document.querySelector('#wallet-disconnect'),
  walletMenuNetwork: document.querySelector('#wallet-menu-network'),
  walletPickerBackdrop: document.querySelector('#wallet-picker-backdrop'),
  walletPicker: document.querySelector('#wallet-picker'),
  walletPickerClose: document.querySelector('#wallet-picker-close'),
  walletPickerList: document.querySelector('#wallet-picker-list'),
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function slugify(value) {
  return String(value || 'veilforge-project')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'veilforge-project';
}

function shortHash(value, head = 12, tail = 8) {
  const text = String(value ?? '');
  return text.length > head + tail + 3 ? `${text.slice(0, head)}…${text.slice(-tail)}` : text;
}



function safeStorageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function safeStorageRemove(key) {
  try { localStorage.removeItem(key); } catch {}
}

function readDeploymentEvidence() {
  try {
    const value = JSON.parse(safeStorageGet(DEPLOYMENT_EVIDENCE_KEY) || 'null');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function readIntentDeclaration() {
  try {
    const value = JSON.parse(safeStorageGet(INTENT_KEY) || 'null');
    return {
      defaults: {
        publicObserver: ['allowed', 'denied'].includes(value?.defaults?.publicObserver) ? value.defaults.publicObserver : DEFAULT_INTENT_DECLARATION.defaults.publicObserver,
        externalContract: ['allowed', 'restricted', 'denied'].includes(value?.defaults?.externalContract) ? value.defaults.externalContract : DEFAULT_INTENT_DECLARATION.defaults.externalContract,
        recordOwner: ['allowed', 'restricted'].includes(value?.defaults?.recordOwner) ? value.defaults.recordOwner : DEFAULT_INTENT_DECLARATION.defaults.recordOwner,
      },
      controls: {
        requireLeastPrivilege: value?.controls?.requireLeastPrivilege !== false,
        requireRevocationPath: value?.controls?.requireRevocationPath !== false,
        prohibitSensitiveRevertData: value?.controls?.prohibitSensitiveRevertData !== false,
        requireDeploymentLineage: value?.controls?.requireDeploymentLineage !== false,
      },
    };
  } catch {
    return structuredClone(DEFAULT_INTENT_DECLARATION);
  }
}

function shortAddress(address) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Connect wallet';
}

function setWalletUi(address = null, providerInfo = state.walletProviderInfo) {
  state.walletAccount = address || null;
  if (!address) state.walletProviderInfo = null;
  else if (providerInfo) state.walletProviderInfo = providerInfo;
  const connected = Boolean(address);
  elements.walletButton?.classList.toggle('connected', connected);
  elements.walletButton?.setAttribute('aria-expanded', 'false');
  if (elements.walletLabel) elements.walletLabel.textContent = connected ? shortAddress(address) : 'Connect wallet';
  if (elements.walletMenuAddress) elements.walletMenuAddress.textContent = connected ? address : '—';
  if (elements.walletMenuNetwork) {
    const walletName = state.walletProviderInfo?.name;
    elements.walletMenuNetwork.textContent = connected && walletName ? `Arc Network Testnet · ${walletName}` : 'Arc Network Testnet';
  }
  if (elements.walletViewExplorer) elements.walletViewExplorer.href = connected ? `${ARC_TESTNET.blockExplorerUrls[0]}/address/${address}` : '#';
}

function normalizeWalletError(error, walletName = 'EVM wallet') {
  if (error?.code === 4001) return `${walletName} connection was cancelled.`;
  if (error?.code === -32002) return `A ${walletName} connection request is already open. Check the wallet extension.`;
  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message
      .replaceAll('MetaMask', walletName)
      .replaceAll('metamask', walletName.toLowerCase());
  }
  if (typeof error === 'string' && error.trim()) return error;
  return `Unable to connect ${walletName}. Unlock the wallet extension and try again.`;
}

function openWalletMenu() {
  if (!state.walletAccount || !elements.walletMenu || !elements.walletBackdrop) return;
  elements.walletMenu.hidden = false;
  elements.walletBackdrop.hidden = false;
  elements.walletMenu.setAttribute('aria-hidden', 'false');
  elements.walletButton?.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => {
    elements.walletMenu.classList.add('open');
    elements.walletBackdrop.classList.add('open');
  });
}

function closeWalletMenu() {
  if (!elements.walletMenu || !elements.walletBackdrop) return;
  elements.walletMenu.classList.remove('open');
  elements.walletBackdrop.classList.remove('open');
  elements.walletMenu.setAttribute('aria-hidden', 'true');
  elements.walletButton?.setAttribute('aria-expanded', 'false');
  setTimeout(() => {
    elements.walletMenu.hidden = true;
    elements.walletBackdrop.hidden = true;
  }, 170);
}

const announcedWalletProviders = [];
const boundWalletProviders = new WeakSet();
let walletPickerCandidates = [];
let pendingWalletContext = null;

const WALLET_BRANDS = [
  { id: 'keplr', label: 'Keplr EVM', order: 10, tokens: ['keplr', 'app.keplr'] },
  { id: 'metamask', label: 'MetaMask', order: 20, tokens: ['metamask', 'io.metamask'] },
  { id: 'phantom', label: 'Phantom', order: 30, tokens: ['phantom', 'app.phantom'] },
  { id: 'rabby', label: 'Rabby Wallet', order: 40, tokens: ['rabby', 'io.rabby'] },
  { id: 'zerion', label: 'Zerion', order: 50, tokens: ['zerion', 'io.zerion.wallet'] },
];

function identifyWalletBrand(suppliedInfo = {}, provider = null) {
  const metadata = `${String(suppliedInfo.rdns || '')} ${String(suppliedInfo.name || '')}`.toLowerCase();
  const metadataMatch = WALLET_BRANDS.find((brand) => brand.tokens.some((token) => metadata.includes(token)));
  if (metadataMatch) return metadataMatch;

  if (provider === globalThis.keplr?.ethereum || provider?.isKeplr) return WALLET_BRANDS[0];
  if (provider === globalThis.phantom?.ethereum || provider?.isPhantom) return WALLET_BRANDS[2];
  if (provider?.isZerion) return WALLET_BRANDS[4];
  if (provider?.isRabby) return WALLET_BRANDS[3];
  if (provider?.isMetaMask) return WALLET_BRANDS[1];
  return null;
}

function detectLegacyWalletName(provider) {
  const brand = identifyWalletBrand({}, provider);
  if (brand) return brand.label;
  if (provider?.isCoinbaseWallet) return 'Coinbase Wallet';
  if (provider?.isBraveWallet) return 'Brave Wallet';
  if (provider?.isTrust || provider?.isTrustWallet) return 'Trust Wallet';
  if (provider?.isFrame) return 'Frame';
  return 'Browser EVM Wallet';
}

function normalizeWalletCandidate(candidate) {
  const provider = candidate?.provider || candidate;
  if (!provider?.request) return null;
  const suppliedInfo = candidate?.info || {};
  const brand = identifyWalletBrand(suppliedInfo, provider);
  const suppliedName = String(suppliedInfo.name || '').trim();
  const name = brand?.label || suppliedName || detectLegacyWalletName(provider);
  const rdns = String(suppliedInfo.rdns || '').trim();
  const uuid = String(suppliedInfo.uuid || '').trim();
  const icon = String(suppliedInfo.icon || '').trim();
  const quality = (rdns ? 8 : 0) + (uuid ? 4 : 0) + (icon ? 6 : 0) + (suppliedName ? 2 : 0);
  return {
    provider,
    quality,
    info: {
      name,
      brandId: brand?.id || '',
      brandOrder: brand?.order ?? 1000,
      rdns,
      uuid,
      icon,
    },
  };
}

function rememberWalletProvider(candidate) {
  const normalized = normalizeWalletCandidate(candidate);
  if (!normalized) return;
  if (announcedWalletProviders.some((item) => item.provider === normalized.provider)) return;
  announcedWalletProviders.push(normalized);
}

function collectLegacyWalletProviders() {
  const injected = globalThis.ethereum;
  if (Array.isArray(injected?.providers) && injected.providers.length) injected.providers.forEach(rememberWalletProvider);
  else rememberWalletProvider(injected);

  if (globalThis.keplr?.ethereum) {
    rememberWalletProvider({
      provider: globalThis.keplr.ethereum,
      info: { name: 'Keplr EVM', rdns: 'app.keplr' },
    });
  }
  if (globalThis.phantom?.ethereum) {
    rememberWalletProvider({
      provider: globalThis.phantom.ethereum,
      info: { name: 'Phantom', rdns: 'app.phantom' },
    });
  }
}

function requestAnnouncedProviders() {
  collectLegacyWalletProviders();
  if (typeof globalThis.dispatchEvent !== 'function') return;
  try { globalThis.dispatchEvent(new Event('eip6963:requestProvider')); } catch {}
  collectLegacyWalletProviders();
}

function walletCandidateKey(candidate) {
  if (candidate.info.brandId) return `brand:${candidate.info.brandId}`;
  if (candidate.info.rdns) return `rdns:${candidate.info.rdns.toLowerCase()}`;
  if (candidate.info.uuid) return `uuid:${candidate.info.uuid.toLowerCase()}`;
  return `name:${candidate.info.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
}

function getWalletCandidates() {
  requestAnnouncedProviders();
  const deduplicated = new Map();
  for (const candidate of announcedWalletProviders) {
    const key = walletCandidateKey(candidate);
    const current = deduplicated.get(key);
    if (!current || candidate.quality > current.quality) deduplicated.set(key, candidate);
  }
  return [...deduplicated.values()].sort((left, right) => {
    const order = (left.info.brandOrder ?? 1000) - (right.info.brandOrder ?? 1000);
    if (order) return order;
    return left.info.name.localeCompare(right.info.name, undefined, { sensitivity: 'base' });
  });
}

const WALLET_ICON_FALLBACKS = {
  keplr: 'data:image/svg+xml;utf8,' + encodeURIComponent(String.raw`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="18" fill="#101a2d"/><circle cx="32" cy="32" r="23" fill="url(#g)"/><path d="M24 18h7v12l10-12h9L38 32l13 14h-9L31 34v12h-7V18Z" fill="#F8FBFF"/><defs><linearGradient id="g" x1="16" y1="12" x2="52" y2="54" gradientUnits="userSpaceOnUse"><stop stop-color="#3B82F6"/><stop offset="1" stop-color="#8B5CF6"/></linearGradient></defs></svg>`),
  phantom: 'data:image/svg+xml;utf8,' + encodeURIComponent(String.raw`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="18" fill="#101a2d"/><path d="M32 13c9.76 0 18.9 5.02 23.94 13.2 1.95 3.18 2.32 7.08.89 10.64C54.5 42.64 49 46 42.86 46H21.14C15 46 9.5 42.64 7.17 36.84c-1.43-3.56-1.06-7.46.89-10.64C13.1 18.02 22.24 13 32 13Z" fill="url(#g)"/><path d="M24.8 32.6a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm14.4 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" fill="#F9FAFF"/><path d="M20.5 38c2.6 2.55 6.56 4 11.5 4s8.9-1.45 11.5-4" stroke="#F9FAFF" stroke-width="3.2" stroke-linecap="round"/><defs><linearGradient id="g" x1="12" y1="14" x2="52" y2="50" gradientUnits="userSpaceOnUse"><stop stop-color="#7C5CFF"/><stop offset="1" stop-color="#B39BFF"/></linearGradient></defs></svg>`),
};

function customWalletIcon(brandId = '') {
  return WALLET_ICON_FALLBACKS[String(brandId || '').toLowerCase()] || '';
}

function safeWalletIcon(icon, brandId = '') {
  const normalized = String(icon || '').trim();
  if (/^data:image\/(?:png|webp|gif|svg\+xml)[;,]/i.test(normalized)) return normalized;
  return customWalletIcon(brandId);
}

function renderWalletPicker(candidates) {
  walletPickerCandidates = candidates;
  if (!elements.walletPickerList) return;
  elements.walletPickerList.innerHTML = candidates.map((candidate, index) => {
    const icon = safeWalletIcon(candidate.info.icon, candidate.info.brandId);
    const fallback = esc(candidate.info.name.slice(0, 1).toUpperCase());
    return `<button class="wallet-choice" type="button" data-wallet-choice="${index}">
      <span class="wallet-choice-icon">${icon ? `<img src="${esc(icon)}" alt="" />` : fallback}</span>
      <span><b>${esc(candidate.info.name)}</b><small>Installed EVM browser wallet</small></span>
      <em>Connect →</em>
    </button>`;
  }).join('');
}

function openWalletPicker(candidates, context = {}) {
  if (!elements.walletPicker || !elements.walletPickerBackdrop) return;
  pendingWalletContext = context;
  renderWalletPicker(candidates);
  elements.walletPicker.hidden = false;
  elements.walletPickerBackdrop.hidden = false;
  elements.walletPicker.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    elements.walletPicker.classList.add('open');
    elements.walletPickerBackdrop.classList.add('open');
  });
}

function closeWalletPicker() {
  if (!elements.walletPicker || !elements.walletPickerBackdrop) return;
  elements.walletPicker.classList.remove('open');
  elements.walletPickerBackdrop.classList.remove('open');
  elements.walletPicker.setAttribute('aria-hidden', 'true');
  setTimeout(() => {
    elements.walletPicker.hidden = true;
    elements.walletPickerBackdrop.hidden = true;
  }, 170);
}

function bindWalletProviderEvents(provider, providerInfo) {
  if (!provider?.on || boundWalletProviders.has(provider)) return;
  boundWalletProviders.add(provider);
  provider.on('accountsChanged', (accounts) => {
    if (state.walletProvider !== provider) return;
    if (accounts?.[0]) {
      safeStorageRemove(WALLET_DISCONNECTED_KEY);
      setWalletUi(accounts[0], providerInfo);
    } else {
      setWalletUi(null);
      closeWalletMenu();
    }
  });
  provider.on('chainChanged', () => {
    if (state.walletProvider === provider && state.walletAccount) {
      setMessage('Wallet network changed. VeilForge will request Arc Testnet before publishing.');
    }
  });
}

async function connectWithWalletCandidate(candidate, context = {}) {
  const normalized = normalizeWalletCandidate(candidate);
  if (!normalized) throw new Error('The selected wallet does not expose an EIP-1193 provider.');
  const { provider, info } = normalized;
  const resultElement = context.resultElement || null;
  try {
    closeWalletPicker();
    if (elements.walletButton) elements.walletButton.disabled = true;
    state.walletProvider = provider;
    state.walletProviderInfo = info;
    bindWalletProviderEvents(provider, info);
    const account = await connectWallet(provider);
    await ensureArcTestnet(provider);
    safeStorageRemove(WALLET_DISCONNECTED_KEY);
    setWalletUi(account, info);
    setMessage(`${info.name} connected: ${shortAddress(account)} on Arc Testnet.`, 'success');
    if (resultElement) resultElement.textContent = `Wallet connected: ${account}`;
    if (state.activeView === 'proof') renderWorkspace();
    return account;
  } catch (error) {
    state.walletProvider = null;
    state.walletProviderInfo = null;
    setWalletUi(null);
    const message = normalizeWalletError(error, info.name);
    setMessage(message, 'error');
    if (resultElement) resultElement.textContent = message;
    return null;
  } finally {
    if (elements.walletButton) elements.walletButton.disabled = false;
    pendingWalletContext = null;
  }
}

async function beginWalletConnection(context = {}) {
  if (state.walletAccount) {
    if (context.openSessionWhenConnected) openWalletMenu();
    else if (context.resultElement) context.resultElement.textContent = `Wallet connected: ${state.walletAccount}`;
    return state.walletAccount;
  }

  let candidates = getWalletCandidates();
  if (!candidates.length) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    candidates = getWalletCandidates();
  }
  if (!candidates.length) {
    const message = 'No compatible EVM browser wallet was detected. Install or unlock a wallet such as MetaMask, Rabby or Zerion, then try again.';
    setMessage(message, 'error');
    if (context.resultElement) context.resultElement.textContent = message;
    return null;
  }
  if (candidates.length === 1) return connectWithWalletCandidate(candidates[0], context);
  openWalletPicker(candidates, context);
  return null;
}

async function connectHeaderWallet() {
  if (state.walletAccount) {
    openWalletMenu();
    return;
  }
  await beginWalletConnection({ openSessionWhenConnected: false });
}

async function hydrateWallet() {
  requestAnnouncedProviders();
  await new Promise((resolve) => setTimeout(resolve, 60));
  if (safeStorageGet(WALLET_DISCONNECTED_KEY) === '1') { setWalletUi(null); return; }
  for (const candidate of getWalletCandidates()) {
    try {
      const accounts = await candidate.provider.request({ method: 'eth_accounts' });
      if (!accounts?.[0]) continue;
      state.walletProvider = candidate.provider;
      state.walletProviderInfo = candidate.info;
      bindWalletProviderEvents(candidate.provider, candidate.info);
      setWalletUi(accounts[0], candidate.info);
      return;
    } catch {}
  }
  setWalletUi(null);
}

function disconnectWalletUi() {
  safeStorageSet(WALLET_DISCONNECTED_KEY, '1');
  state.walletProvider = null;
  state.walletProviderInfo = null;
  setWalletUi(null);
  closeWalletMenu();
  setMessage('Wallet disconnected from VeilForge. Your browser wallet remains installed and unchanged.');
}

function statusClass(status) {
  if (status === 'Ready') return 'status-ready';
  if (status === 'Review Required') return 'status-review';
  if (status === 'High Risk') return 'status-risk';
  return 'status-blocked';
}

function scoreColor(report) {
  if (!report) return '#6effc2';
  if (report.status === 'Ready') return '#6effc2';
  if (report.status === 'Review Required') return '#ffc766';
  if (report.status === 'High Risk') return '#ff9b63';
  return '#ff6f79';
}

function fileSize(content) {
  const bytes = new TextEncoder().encode(content).length;
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function normalizeUiMessage(message) {
  if (message == null) return '';
  if (message instanceof Error) return message.message;
  if (typeof message === 'string') return message;
  if (typeof message === 'object') {
    if (typeof message.message === 'string') return message.message;
    if (typeof message.status === 'string') return message.status;
    try { return JSON.stringify(message); } catch { return 'Operation completed.'; }
  }
  return String(message);
}

function setMessage(message, type = 'normal') {
  elements.scanMessage.textContent = normalizeUiMessage(message);
  elements.scanMessage.style.color = type === 'error' ? 'var(--red)' : type === 'success' ? 'var(--green)' : '';
}

function cloneSourceFiles(files = []) {
  return files
    .filter((file) => typeof file?.path === 'string' && typeof file?.content === 'string')
    .map((file) => ({ path: file.path, content: file.content }));
}

function readHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value
      .filter((item) => item?.report?.reportHash && Array.isArray(item.report.findings))
      .slice(0, MAX_HISTORY)
      .map((item) => ({ ...item, files: cloneSourceFiles(item.files) }));
  } catch {
    return [];
  }
}

function writeHistory() {
  try {
    // Persist reports without Solidity source content. Source snapshots remain
    // available for the current browser session, while localStorage stays small.
    const persisted = state.history.slice(0, MAX_HISTORY).map(({ files: _files, ...item }) => item);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(persisted));
    return true;
  } catch (error) {
    console.warn('Local history could not be saved.', error);
    return false;
  }
}

function saveCurrentToHistory() {
  if (!state.report) return;
  const label = elements.projectName.value.trim() || 'Solidity project';
  state.history = state.history.filter((item) => item.report?.reportHash !== state.report.reportHash);
  state.history.unshift({
    id: state.report.reportHash,
    label,
    savedAt: new Date().toISOString(),
    report: structuredClone(state.report),
    files: cloneSourceFiles(state.files),
  });
  state.history = state.history.slice(0, MAX_HISTORY);
  writeHistory();
}

async function readBrowserFiles(fileList) {
  const entries = [];
  for (const file of [...fileList]) {
    const path = (file.webkitRelativePath || file.name).replaceAll('\\', '/');
    if (/(^|\/)(?:node_modules|\.git|out|cache|artifacts|dist|build)(\/|$)/i.test(path)) continue;
    const isZip = file.name.toLowerCase().endsWith('.zip') || /(?:application\/zip|application\/x-zip-compressed)/i.test(file.type);
    if (isZip) {
      entries.push(...await readZipEntries(file));
      continue;
    }
    if (file.size > 12 * 1024 * 1024) continue;
    const content = await file.text();
    if (!file.name.toLowerCase().endsWith('.sol') && !looksLikeSolidity(content)) continue;
    entries.push({ path: path.toLowerCase().endsWith('.sol') ? path : `${path}.sol`, content });
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function invalidateCurrentReport() {
  state.report = null;
  state.filters = { query: '', severity: 'all', policy: 'all' };
  delete document.body.dataset.reportHash;
  delete document.body.dataset.projectStatus;
  renderSummary();
  renderWorkspace();
}

function setFiles(files, { invalidateReport = true, announce = true } = {}) {
  const unique = new Map();
  for (const file of cloneSourceFiles(files)) unique.set(file.path, file);
  state.projectFiles = [...unique.values()].sort((a, b) => a.path.localeCompare(b.path));
  state.projectXray = state.projectFiles.length ? analyzeProject(state.projectFiles) : null;
  state.files = state.projectXray?.scopeFiles ?? [];
  if (invalidateReport) {
    state.bytecodeTruth.verification = null;
    state.bytecodeTruth.error = null;
    state.proofLab = { receipt: null, receiptFileName: '', snapshot: null, error: null };
  }
  if (invalidateReport && state.report) invalidateCurrentReport();
  if (!state.files.length) clearDetectorSeveritySummary();
  renderFileList();
  if (announce) {
    setMessage(state.files.length ? `${state.files.length} Solidity file${state.files.length === 1 ? '' : 's'} ready. Run a fresh scan.` : 'Add at least one Solidity file.');
  }
}

function renderFileList() {
  if (!state.files.length) {
    elements.fileList.innerHTML = '<div class="empty-files">No Solidity files loaded.</div>';
    return;
  }
  const scopeNote = state.projectXray ? `<div class="scope-note"><span>${state.files.length} in scan scope</span><small>${state.projectXray.excluded.length} excluded</small></div>` : '';
  elements.fileList.innerHTML = scopeNote + state.files.map((file) => `
    <div class="file-item" title="${esc(file.path)}">
      <span>${esc(file.path)}</span>
      <small>${esc(fileSize(file.content))}</small>
    </div>
  `).join('');
}

const DEMOS = {
  vulnerable: [
    ['Payroll.sol', './examples/vulnerable-payroll/Payroll.sol'],
  ],
  hardened: [
    ['PayrollPrivateReady.sol', './examples/remediated-payroll/PayrollPrivateReady.sol'],
  ],
  multi: [
    ['contracts/Payroll.sol', './examples/multi-contract/Payroll.sol'],
    ['contracts/Settlement.sol', './examples/multi-contract/Settlement.sol'],
  ],
};

async function loadDemo(name, { scan = false } = {}) {
  const demo = DEMOS[name];
  if (!demo) return;
  setMessage(`Loading ${name} demo…`);
  const files = await Promise.all(demo.map(async ([path, url]) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url}.`);
    return { path, content: await response.text() };
  }));
  setFiles(files);
  elements.projectName.value = name === 'hardened' ? 'Arc Payroll — Hardened' : name === 'multi' ? 'Arc Multi-Contract Payroll' : 'Arc Payroll Mission';
  if (scan) runScan();
}

function renderSummary() {
  const report = state.report;
  if (!report) {
    elements.missionSummary.innerHTML = `
      <div class="empty-state">
        <div><strong>Mission awaiting scan</strong><span>Load Solidity files and run the deterministic analyzer.</span></div>
      </div>`;
    return;
  }

  elements.missionSummary.innerHTML = `
    <div class="summary-grid">
      <div class="score-orbit" style="--score:${report.score};--score-color:${scoreColor(report)}">
        <div class="score-value"><strong>${report.score}</strong><span>Readiness</span></div>
      </div>
      <div class="status-block">
        <span class="status-chip ${statusClass(report.status)}">${esc(report.status)}</span>
        <h2>${esc(elements.projectName.value || 'Solidity mission')}</h2>
        <p>${report.status === 'Ready'
          ? 'No deterministic privacy rule matched. Keep manual review and deployment controls in place.'
          : `${report.summary.critical} critical, ${report.summary.high} high and ${report.attackLab.summary.mapped} source-evidence path${report.attackLab.summary.mapped === 1 ? '' : 's'} require review.`}</p>
      </div>
      <div class="metric-grid">
        <div class="metric-card"><span>Intent compliance</span><strong>${report.privacyIntent.complianceScore}</strong></div>
        <div class="metric-card"><span>Attack defense</span><strong>${report.attackLab.summary.defenseScore}</strong></div>
        <div class="metric-card"><span>Sensitive assets</span><strong>${report.privacyGenome.metrics.sensitiveAssets}</strong></div>
        <div class="metric-card"><span>Blast radius</span><strong>${report.privacyGenome.metrics.blastRadius}</strong></div>
      </div>
    </div>
    <div class="hash-line">
      <div><span>Canonical source hash</span><code title="${report.sourceHash}">${esc(report.sourceHash)}</code></div>
      <div><span>Canonical report hash</span><code title="${report.reportHash}">${esc(report.reportHash)}</code></div>
    </div>`;
}

function workspaceHeader(eyebrow, title, description, actions = '') {
  return `
    <div class="workspace-header">
      <div><span class="eyebrow">${esc(eyebrow)}</span><h3>${esc(title)}</h3><p>${esc(description)}</p></div>
      <div class="workspace-actions">${actions}</div>
    </div>`;
}

function emptyWorkspace(title = 'Run a scan first', text = 'Mission Control will populate after deterministic analysis completes.') {
  return `${renderProjectXray()}${workspaceHeader('Mission Control', title, text)}<div class="empty-state"><div><strong>${esc(title)}</strong><span>${esc(text)}</span></div></div>`;
}

function renderProjectXray() {
  const xray = state.projectXray;
  if (!xray) return '';
  const roles = xray.files.reduce((counts, file) => ({ ...counts, [file.role]: (counts[file.role] || 0) + 1 }), {});
  const nodes = xray.files.slice(0, 12).map((file) => `
    <article class="xray-node role-${esc(file.role)}" title="${esc(file.path)}">
      <span>${esc(file.role)}</span><strong>${esc(file.path.split('/').at(-1))}</strong><small>${file.imports.length} import${file.imports.length === 1 ? '' : 's'}</small>
    </article>`).join('');
  const entries = xray.entryContracts.slice(0, 6).map((item) => `<span title="${esc(item.file)}">${esc(item.name)}</span>`).join('');
  return `<section class="project-xray">
    <header><div><span>PROJECT X-RAY</span><strong>${esc(xray.framework)}</strong></div><em>${state.files.length}/${xray.files.length} scoped</em></header>
    <div class="xray-metrics">
      <div><span>Deployable</span><strong>${xray.entryContracts.length}</strong></div>
      <div><span>Imports</span><strong>${xray.imports}</strong></div>
      <div><span>Dependencies</span><strong>${(roles.interface || 0) + (roles.library || 0) + (roles.abstract || 0) + (roles.supporting || 0)}</strong></div>
      <div><span>Excluded</span><strong>${xray.excluded.length}</strong></div>
    </div>
    <div class="xray-map">${nodes}</div>
    <footer><div><small>ENTRY CONTRACTS</small>${entries || '<span>Source-only project</span>'}</div><p>${xray.upgradeable ? 'Upgradeable architecture signal detected.' : 'Static contract architecture detected.'}${xray.externalImports.length ? ` ${xray.externalImports.length} external import${xray.externalImports.length === 1 ? '' : 's'} mapped.` : ''}</p></footer>
  </section>`;
}

function renderTriage() {
  const report = state.report;
  if (!report) return emptyWorkspace();
  const xrayPanel = renderProjectXray();
  const contractCards = report.contracts.map((contract) => `
    <article class="contract-card">
      <div class="contract-top">
        <div><h4>${esc(contract.name)}</h4><small title="${esc(contract.file)}">${esc(contract.file)}</small></div>
        <div class="contract-score ${statusClass(contract.status)}">${contract.score}</div>
      </div>
      <div class="contract-stats">
        <div><span>Status</span><strong class="${statusClass(contract.status)}">${esc(contract.status)}</strong></div>
        <div><span>Critical / High</span><strong>${contract.summary.critical} / ${contract.summary.high}</strong></div>
        <div><span>Selectors</span><strong>${contract.selectorCount}</strong></div>
      </div>
    </article>`).join('');

  const query = state.filters.query.toLowerCase();
  const findings = report.findings.filter((finding) => {
    if (state.filters.severity !== 'all' && finding.severity !== state.filters.severity) return false;
    if (state.filters.policy !== 'all' && finding.suggestedPolicy !== state.filters.policy) return false;
    if (query && ![finding.ruleId, finding.title, finding.contractName, finding.file, finding.evidence].join(' ').toLowerCase().includes(query)) return false;
    return true;
  });

  const findingCards = findings.length ? findings.map((finding) => `
    <details class="finding-card">
      <summary>
        <span class="severity-badge severity-${finding.severity}">${finding.severity}</span>
        <span class="finding-title"><strong>${esc(finding.ruleId)} · ${esc(finding.title)}</strong><small>${esc(finding.contractName)} · ${esc(finding.file)}:${finding.startLine}</small></span>
        <span class="finding-policy">${esc(finding.suggestedPolicy)}</span>
      </summary>
      <div class="finding-body">
        <div class="finding-columns">
          <div class="detail-block"><h5>Impact</h5><p>${esc(finding.impact)}</p></div>
          <div class="detail-block"><h5>Treatment</h5><p>${esc(finding.remediation)}</p></div>
        </div>
        <pre class="code-block">${esc(finding.evidence)}</pre>
        ${finding.saferPattern ? `<div class="detail-block" style="margin-top:12px"><h5>Safer pattern</h5><pre class="code-block">${esc(finding.saferPattern)}</pre></div>` : ''}
      </div>
    </details>`).join('') : '<div class="empty-state"><div><strong>No matching findings</strong><span>Adjust the filters or review the Ready result.</span></div></div>';

  return xrayPanel + workspaceHeader('Project triage', 'Contract readiness dashboard', 'Contract-level deployment states and deterministic findings.', `<span class="status-chip ${statusClass(report.status)}">${esc(report.status)}</span>`) +
    `<div class="contract-grid">${contractCards || '<div class="contract-card"><h4>No implementation contract parsed</h4></div>'}</div>` +
    `<div class="filter-row">
      <input id="finding-query" class="text-input" placeholder="Search rule, contract, file or evidence" value="${esc(state.filters.query)}" />
      <select id="severity-filter" class="select-input"><option value="all">All severities</option>${['critical','high','medium','low'].map((item) => `<option value="${item}" ${state.filters.severity === item ? 'selected' : ''}>${item}</option>`).join('')}</select>
      <select id="policy-filter" class="select-input"><option value="all">All policies</option>${['Open','Restricted','Locked'].map((item) => `<option value="${item}" ${state.filters.policy === item ? 'selected' : ''}>${item}</option>`).join('')}</select>
    </div><div class="finding-list">${findingCards}</div>`;
}


function renderGenome() {
  const report = state.report;
  if (!report) return emptyWorkspace();
  const genome = report.privacyGenome;
  const assets = genome.assets.slice(0, 14).map((asset) => `
    <article class="genome-asset">
      <span class="asset-kind kind-${esc(asset.kind)}">${esc(asset.kind)}</span>
      <div><strong>${esc(asset.label)}</strong><small>${esc(asset.contractName)} · ${esc(asset.file)}:${asset.line}</small></div>
      <em>${esc(asset.sensitivity)}</em>
    </article>`).join('');
  const matrix = genome.disclosureMatrix.slice(0, 12).map((row) => `
    <tr><th><strong>${esc(row.asset)}</strong><small>${esc(row.sensitivity)}</small></th>${row.channels.slice(0, 5).map((entry) => `<td><span class="matrix-state matrix-${entry.status.toLowerCase().replaceAll(' ', '-')}">${esc(entry.status)}</span></td>`).join('')}</tr>`).join('');
  const actorHeaders = genome.actors.slice(0, 5).map((actor) => `<th title="${esc(actor.description)}">${esc(actor.label)}</th>`).join('');
  const graphNodes = genome.graph.nodes.filter((node) => ['contract','function','asset','finding','policy'].includes(node.type)).slice(0, 24).map((node) => `
    <div class="genome-node node-${esc(node.type)} risk-${esc(node.risk)}"><span>${esc(node.type)}</span><strong>${esc(node.label)}</strong><small>${esc(node.file)}:${node.line}</small></div>`).join('');
  return workspaceHeader('Privacy Genome', 'The project’s privacy anatomy', 'Sensitive assets, actors, semantic relationships and disclosure boundaries derived from the canonical source model.', `<span class="status-chip ${genome.metrics.publicExposures ? 'status-blocked' : 'status-ready'}">${genome.metrics.nodes} nodes · ${genome.metrics.edges} edges</span>`) + `
    <div class="os-metrics">
      <div><span>Sensitive assets</span><strong>${genome.metrics.sensitiveAssets}</strong><small>storage, calldata and event payloads</small></div>
      <div><span>Public exposures</span><strong>${genome.metrics.publicExposures}</strong><small>actor-to-asset disclosure paths</small></div>
      <div><span>Identity linkability</span><strong>${genome.metrics.identityLinkability}%</strong><small>deterministic correlation estimate</small></div>
      <div><span>Blast radius</span><strong>${genome.metrics.blastRadius}/10</strong><small>project-wide disclosure pressure</small></div>
    </div>
    <div class="genome-layout">
      <section class="os-panel"><div class="os-panel-head"><div><span>ASSET REGISTRY</span><strong>Protected data surface</strong></div><em>${genome.assets.length} mapped</em></div><div class="genome-assets">${assets || '<div class="empty-state"><div><strong>No sensitive asset inferred</strong><span>Review names and policies manually.</span></div></div>'}</div></section>
      <section class="os-panel"><div class="os-panel-head"><div><span>SEMANTIC GRAPH</span><strong>Source relationships</strong></div><em>${genome.graph.edges.length} edges</em></div><div class="genome-graph">${graphNodes || '<div class="empty-state"><div><strong>No graph node</strong></div></div>'}</div></section>
    </div>
    <section class="os-panel matrix-panel"><div class="os-panel-head"><div><span>WHO CAN SEE WHAT?</span><strong>Disclosure Matrix</strong></div><em>Evidence-derived</em></div><div class="matrix-scroll"><table class="disclosure-matrix"><thead><tr><th>Protected asset</th>${actorHeaders}</tr></thead><tbody>${matrix || '<tr><td colspan="6">No sensitive asset mapped.</td></tr>'}</tbody></table></div></section>`;
}

function renderIntent() {
  const report = state.report;
  if (!report) return emptyWorkspace();
  const intent = report.privacyIntent;
  const violations = intent.violations.map((item) => `<article class="intent-violation severity-frame-${item.severity}"><span>${esc(item.severity)}</span><div><strong>${esc(item.asset)} → ${esc(item.actor)}</strong><p>${esc(item.rule)}</p></div></article>`).join('');
  const declaration = state.intentDeclaration;
  const option = (value, label, selected) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`;
  return workspaceHeader('Privacy Intent Studio', 'Declare privacy rules without writing code', 'Choose the intended disclosure boundaries, then compile them into the canonical report and compare the source against your declaration.', `<button class="action-button primary" data-action="export-intent">Download intent YAML</button>`) + `
    <section class="os-panel intent-studio" data-testid="intent-studio">
      <div class="os-panel-head"><div><span>NO-CODE POLICY</span><strong>Disclosure defaults and required controls</strong></div><em>${intent.declarationSource === 'user-declared' ? 'Declared' : 'Default profile'}</em></div>
      <div class="intent-studio-grid">
        <label><span>Public observer</span><select id="intent-public-observer" class="select-input">${option('denied', 'Denied', declaration.defaults.publicObserver)}${option('allowed', 'Allowed', declaration.defaults.publicObserver)}</select><small>Can an unauthenticated observer read the protected value?</small></label>
        <label><span>External contract</span><select id="intent-external-contract" class="select-input">${option('restricted', 'Restricted', declaration.defaults.externalContract)}${option('denied', 'Denied', declaration.defaults.externalContract)}${option('allowed', 'Allowed', declaration.defaults.externalContract)}</select><small>How may integrations cross the privacy boundary?</small></label>
        <label><span>Record owner</span><select id="intent-record-owner" class="select-input">${option('allowed', 'Allowed', declaration.defaults.recordOwner)}${option('restricted', 'Restricted', declaration.defaults.recordOwner)}</select><small>What is the subject allowed to see about their record?</small></label>
        <div class="intent-control-list">
          <label><input id="intent-least-privilege" type="checkbox" ${declaration.controls.requireLeastPrivilege ? 'checked' : ''}/><span>Require least privilege</span></label>
          <label><input id="intent-revocation" type="checkbox" ${declaration.controls.requireRevocationPath ? 'checked' : ''}/><span>Require revocation path</span></label>
          <label><input id="intent-revert-data" type="checkbox" ${declaration.controls.prohibitSensitiveRevertData ? 'checked' : ''}/><span>Prohibit sensitive revert data</span></label>
          <label><input id="intent-lineage" type="checkbox" ${declaration.controls.requireDeploymentLineage ? 'checked' : ''}/><span>Require deployment lineage</span></label>
        </div>
      </div>
      <div class="intent-studio-actions"><p>Applying this policy creates a new deterministic report hash; the Solidity source hash remains unchanged.</p><button class="action-button primary" data-action="apply-intent">Apply policy and rescan</button></div>
    </section>
    <div class="intent-layout">
      <section class="intent-score-card ${intent.complianceScore >= 90 ? 'intent-good' : intent.complianceScore >= 70 ? 'intent-review' : 'intent-bad'}">
        <span>INTENT COMPLIANCE</span><strong>${intent.complianceScore}</strong><em>/100</em><h4>${esc(intent.status)}</h4><p>${intent.declaredAssets} protected assets compiled under the ${esc(intent.profile)} profile.</p>
      </section>
      <section class="os-panel intent-document"><div class="os-panel-head"><div><span>PRIVACY-INTENT.YAML</span><strong>Machine-readable contract</strong></div><em>Local</em></div><pre>${esc(intent.document)}</pre></section>
    </div>
    <section class="os-panel"><div class="os-panel-head"><div><span>POLICY VIOLATIONS</span><strong>Code-to-intent mismatches</strong></div><em>${intent.violations.length}</em></div><div class="intent-violations">${violations || '<div class="empty-state"><div><strong>Intent aligned</strong><span>No deterministic policy mismatch was found.</span></div></div>'}</div></section>`;
}

function renderShadow() {
  const report = state.report;
  if (!report) return emptyWorkspace();
  const lab = report.attackLab;
  const selected = lab.campaigns.find((campaign) => campaign.id === state.activeReplayId) || lab.campaigns[0];
  if (selected && !state.activeReplayId) state.activeReplayId = selected.id;
  const replayOptions = lab.campaigns.map((campaign) => `<option value="${esc(campaign.id)}" ${campaign.id === selected?.id ? 'selected' : ''}>${String(campaign.sequence).padStart(2, '0')} · ${esc(campaign.ruleId)} · ${esc(campaign.title)}</option>`).join('');
  const cinema = selected ? `
    <section class="replay-cinema" data-replay-id="${esc(selected.id)}">
      <div class="cinema-toolbar"><div><span>ATTACK REPLAY CINEMA</span><strong>${esc(selected.title)}</strong><small>${esc(selected.objective)}</small></div><div><select id="attack-replay-select" class="select-input">${replayOptions}</select><button class="action-button primary" data-action="play-attack-replay">Play replay</button></div></div>
      <div class="cinema-track">${selected.replay.frames.map((frame) => `<article class="cinema-frame signal-${esc(frame.signal)}" data-frame="${frame.frame}"><b>${String(frame.frame).padStart(2, '0')}</b><div><span>${esc(frame.phase)}</span><strong>${esc(frame.headline)}</strong><small>${esc(frame.telemetry)}</small></div></article>`).join('')}</div>
      <div class="cinema-outcome"><span>OUTCOME</span><strong>${esc(selected.replay.outcome)}</strong><small>Source-evidence animation · no bytecode execution</small></div>
    </section>` : '';
  const campaigns = lab.campaigns.map((campaign) => `
    <details class="attack-card severity-frame-${campaign.severity}">
      <summary><div class="attack-index">${String(campaign.sequence).padStart(2, '0')}</div><div><strong>${esc(campaign.title)}</strong><small>${esc(campaign.ruleId)} · ${esc(campaign.contractName)} · ${esc(campaign.file)}:${campaign.line}</small></div><span>${esc(campaign.status)}</span><em>${campaign.blastRadius}/10</em></summary>
      <div class="attack-body"><p>${esc(campaign.objective)}</p><div class="attack-steps">${campaign.steps.map((step) => `<div><span>${esc(step.phase)}</span><strong>${esc(step.label)}</strong><small>${esc(step.detail)}</small></div>`).join('')}</div></div>
    </details>`).join('');
  return workspaceHeader('Shadow Evidence Lab', 'Adversarial paths mapped from source evidence', 'Every campaign is deterministic and tied to a finding. This release does not execute bytecode or claim full EVM emulation.', `<span class="status-chip ${lab.summary.mapped ? 'status-blocked' : 'status-ready'}">Defense ${lab.summary.defenseScore}/100</span>`) + `
    ${cinema}
    <div class="os-metrics shadow-metrics"><div><span>Generated scenarios</span><strong>${lab.summary.attempts}</strong><small>finding-bound campaigns</small></div><div><span>Evidence paths</span><strong>${lab.summary.mapped}</strong><small>source-mapped privacy paths</small></div><div><span>Maximum blast</span><strong>${lab.summary.maximumBlastRadius}/10</strong><small>worst campaign</small></div><div><span>Mode</span><strong class="mode-label">LOCAL</strong><small>no bytecode execution</small></div></div>
    <div class="lab-notice">${esc(lab.disclaimer)}</div>
    <div class="attack-list">${campaigns || '<div class="empty-state"><div><strong>No adversarial path mapped</strong><span>The current deterministic evidence set is clear.</span></div></div>'}</div>`;
}

function renderMRI() {
  const report = state.report;
  if (!report) return emptyWorkspace();
  const traces = report.transactionMRI.traces.map((trace) => `
    <article class="mri-card severity-frame-${trace.severity}">
      <header><div><span>${esc(trace.channel)}</span><strong>${esc(trace.title)}</strong><small>${esc(trace.file)}:${trace.line}</small></div><em>${esc(trace.severity)}</em></header>
      <div class="mri-timeline">${trace.stages.map((stage) => `<div class="mri-stage"><b>${String(stage.order).padStart(2, '0')}</b><div><span>${esc(stage.phase)} · ${esc(stage.visibility)}</span><strong>${esc(stage.title)}</strong><small>${esc(stage.detail)}</small></div></div>`).join('')}</div>
    </article>`).join('');
  return workspaceHeader('Transaction MRI', 'Trace the disclosure from entry point to policy boundary', 'A source-level execution narrative for every deterministic privacy finding.') + `<div class="mri-list">${traces || '<div class="empty-state"><div><strong>No disclosure trace</strong><span>No deterministic finding produced an MRI path.</span></div></div>'}</div>`;
}

function renderForge() {
  const report = state.report;
  if (!report) return emptyWorkspace();
  const forge = report.forgePlan;
  const patches = forge.patches.map((patch) => `
    <article class="forge-card ${patch.supported ? 'forge-ready' : 'forge-review'}">
      <header><div><span>${esc(patch.ruleId)} · ${esc(patch.transformation)}</span><strong>${esc(patch.title)}</strong><small>${esc(patch.file)}:${patch.line}</small></div><em>${esc(patch.status)}</em></header>
      <div class="forge-diff"><div><span>BEFORE</span><pre>${esc(patch.before)}</pre></div><div><span>${patch.supported ? 'CANDIDATE PATCH' : 'ENGINEERING GUIDANCE'}</span><pre>${esc(patch.after)}</pre></div></div>
      <p>${esc(patch.behaviorChange)}</p><footer>${patch.verification.map((item) => `<span>✓ ${esc(item)}</span>`).join('')}</footer>
    </article>`).join('');
  return workspaceHeader('Forge Mode', 'Deterministic hardening candidates', 'Safe, narrow transformations are packaged as reviewable candidates. VeilForge refuses generic mutations when behavior cannot be preserved confidently.', `<button class="action-button primary" data-action="export-forge-zip">Download candidate project ZIP</button>`) + `
    <div class="os-metrics"><div><span>Total findings</span><strong>${forge.summary.total}</strong><small>forge queue</small></div><div><span>Candidate ready</span><strong>${forge.summary.candidateReady}</strong><small>narrow deterministic edits</small></div><div><span>Engineering review</span><strong>${forge.summary.engineeringReview}</strong><small>unsafe to auto-mutate</small></div><div><span>Source files</span><strong>${forge.sourceFiles.length}</strong><small>candidate bundle scope</small></div></div>
    <div class="forge-warning">Candidate patches can change ABI or caller semantics. The downloaded project is intentionally labeled for review and must be compiled and tested before deployment.</div>
    <div class="forge-list">${patches || '<div class="empty-state"><div><strong>No patch required</strong><span>The deterministic rule set found no hardening task.</span></div></div>'}</div>`;
}

function renderPassport() {
  const report = state.report;
  if (!report) return emptyWorkspace();
  const passport = report.privacyPassport;
  const lineage = report.deploymentLineage;
  const evidence = state.deploymentEvidence || {};
  const evidenceStatus = evaluateDeploymentEvidence(lineage, evidence);
  const pillars = Object.entries(passport.pillars).map(([name, value]) => `<div><span>${esc(name.replace(/([A-Z])/g, ' $1'))}</span><strong>${typeof value === 'number' ? `${value}/100` : esc(value)}</strong></div>`).join('');
  const claims = passport.claims.map((claim) => `<li>${esc(claim)}</li>`).join('');
  const lineageStages = lineage.stages.map((stage, index) => `<div class="lineage-stage lineage-${esc(stage.status)}"><b>${String(index + 1).padStart(2, '0')}</b><div><span>${esc(stage.status)}</span><strong>${esc(stage.label)}</strong><small title="${esc(stage.evidence)}">${esc(stage.evidence)}</small></div></div>`).join('');
  return workspaceHeader('Verifiable Privacy Passport', 'A source-bound privacy identity for the project', 'The passport is generated from the exact canonical source hash and automatically reflects current privacy evidence.', `<button class="action-button primary" data-action="export-passport">Download passport JSON</button>`) + `
    <section class="passport-card passport-${passport.status.toLowerCase()}">
      <div class="passport-top"><div><span>VEILFORGE PRIVACY PASSPORT</span><h4>${esc(elements.projectName.value || 'Solidity project')}</h4><code>${esc(passport.passportId)}</code></div><div class="passport-seal"><span>◈</span><strong>${esc(passport.status)}</strong><small>Gate: ${esc(passport.deploymentGate)}</small></div></div>
      <div class="passport-pillars">${pillars}</div>
      <div class="passport-evidence"><div><span>Sensitive assets</span><strong>${passport.evidence.sensitiveAssets}</strong></div><div><span>Public exposures</span><strong>${passport.evidence.publicExposures}</strong></div><div><span>Mapped paths</span><strong>${passport.evidence.mappedCampaigns}</strong></div><div><span>Candidate patches</span><strong>${passport.evidence.candidatePatches}</strong></div></div>
      <div class="passport-hash"><span>Bound source hash</span><code>${esc(passport.sourceHash)}</code></div>
      <ul>${claims}</ul>
    </section>
    <section class="living-lineage os-panel">
      <div class="os-panel-head"><div><span>DEPLOYMENT LINEAGE</span><strong>Living Passport revision ${passport.revision}</strong></div><em class="evidence-${evidenceStatus.valid ? 'linked' : evidenceStatus.status === 'Stale' ? 'stale' : 'unlinked'}">${esc(evidenceStatus.status)}</em></div>
      <div class="lineage-grid">${lineageStages}</div>
      <div class="deployment-linker">
        <div class="deployment-linker-copy"><span>LOCAL EVIDENCE LINK</span><strong>${esc(evidenceStatus.reason)}</strong><small>Linking does not claim RPC or explorer verification. It creates a deterministic local attestation.</small>${evidenceStatus.attestationId ? `<code>${esc(evidenceStatus.attestationId)}</code>` : ''}</div>
        <div class="deployment-fields">
          <input id="deployment-address" class="text-input" placeholder="Contract address 0x…" value="${esc(evidence.contractAddress || '')}" />
          <input id="deployment-tx" class="text-input" placeholder="Deployment transaction 0x…" value="${esc(evidence.transactionHash || '')}" />
          <input id="deployment-bytecode" class="text-input" placeholder="Bytecode hash 0x…" value="${esc(evidence.bytecodeHash || '')}" />
          <div><button class="action-button primary" data-action="link-deployment-evidence">Link local evidence</button>${Object.keys(evidence).length ? '<button class="action-button" data-action="clear-deployment-evidence">Clear</button>' : ''}</div>
        </div>
      </div>
    </section>`;
}

function renderPrivacyTwin(report) {
  const twin = report.privacyTwin;
  const surfaces = twin.surfaces.slice(0, 16).map((surface) => `
    <article class="twin-surface">
      <header><div><span>${esc(surface.contractName)}</span><strong>${esc(surface.signature)}</strong></div><em class="policy-${surface.recommendation.toLowerCase()}">${esc(surface.recommendation)}</em></header>
      <div class="twin-compare"><div><span>PUBLIC ARC</span><p>${esc(surface.publicEvm)}</p></div><div><span>APS READINESS MODEL</span><p>${esc(surface.apsSimulation)}</p></div></div>
      <footer>${esc(surface.adaptation)}</footer>
    </article>`).join('');
  const trusts = twin.trustRequirements.map((item) => `<li><strong>${esc(item.contractName)} · ${esc(item.file)}:${item.line}</strong><span>${esc(item.status)}</span><small>${esc(item.reason)}</small></li>`).join('');
  return workspaceHeader('Privacy Deployment Twin', 'Public Arc and APS readiness, side by side', 'A deterministic digital twin of the current source against Arc’s published privacy design.', `<span class="status-chip ${twin.readinessScore >= 90 ? 'status-ready' : 'status-review'}">Twin ${twin.readinessScore}/100</span>`) + `
    <div class="twin-roadmap"><div><span>${esc(twin.availability.label)}</span><strong>Honest model, not a live APS deployment</strong><p>${esc(twin.availability.statement)}</p></div><code>${esc(shortHash(twin.twinId))}</code></div>
    <div class="os-metrics"><div><span>Selectors modeled</span><strong>${twin.summary.selectors}</strong><small>public vs confidential boundary</small></div><div><span>Restricted</span><strong>${twin.summary.restricted}</strong><small>explicit grants required</small></div><div><span>Locked</span><strong>${twin.summary.locked}</strong><small>blocked by policy</small></div><div><span>Trust decisions</span><strong>${twin.summary.trustDecisions}</strong><small>cross-contract review</small></div></div>
    <div class="twin-surface-list">${surfaces || '<div class="empty-state"><div><strong>No callable surface modeled</strong></div></div>'}</div>
    ${trusts ? `<section class="os-panel twin-trust"><div class="os-panel-head"><div><span>TRUST DOMAIN PLAN</span><strong>Explicit cross-contract decisions</strong></div><em>${twin.summary.trustDecisions}</em></div><ul>${trusts}</ul></section>` : ''}`;
}

function renderChains() {
  const report = state.report;
  if (!report) return emptyWorkspace();
  const chains = report.exposureChains.map((chain) => `
    <article class="chain-card">
      <div class="chain-heading">
        <strong>${esc(chain.ruleId)} · ${esc(chain.contractName)}</strong>
        <small>${esc(chain.file)}:${chain.startLine}</small>
      </div>
      <div class="chain-nodes">
        ${chain.nodes.map((node) => `<div class="chain-node ${node.detected ? '' : 'muted'}" title="${esc(node.detail)}"><span>${esc(node.type)}</span><strong>${esc(node.label)}</strong><small>${esc(node.detail)}</small></div>`).join('')}
      </div>
    </article>`).join('');
  return renderPrivacyTwin(report) + workspaceHeader('Deterministic exposure chains', 'Storage → Function → Event → Selector → Policy', 'Every chain is generated from parsed source evidence and policy rules—never from a model.') +
    `<div class="chain-list">${chains || '<div class="empty-state"><div><strong>No exposure chain detected</strong><span>The current source has no deterministic finding chain.</span></div></div>'}</div>`;
}

function renderTreatment() {
  const report = state.report;
  if (!report) return emptyWorkspace();
  const tasks = report.treatmentPlan.map((task) => `
    <article class="task-card">
      <div class="task-priority priority-${task.priority}">${task.priority}</div>
      <div class="task-main"><strong>${esc(task.ruleId)} · ${esc(task.title)}</strong><p>${esc(task.action)}</p><small>${esc(task.contractName)} · ${esc(task.file)}:${task.startLine}</small></div>
      <div class="task-meta"><span>${task.requiredBeforeDeploy ? 'Required before deploy' : 'Engineering follow-up'}</span><span>Policy: ${esc(task.suggestedPolicy)}</span><span>Status: ${esc(task.status)}</span></div>
    </article>`).join('');
  const counts = ['P0','P1','P2','P3'].map((priority) => `${priority}: ${report.treatmentPlan.filter((task) => task.priority === priority).length}`).join(' · ');
  return workspaceHeader('Treatment Plan 3.2', 'Prioritized remediation queue', `${counts}. P0 and P1 items are marked as required before deployment.`) +
    `<div class="task-list">${tasks || '<div class="empty-state"><div><strong>No treatment task</strong><span>The deterministic rule set did not create a remediation item.</span></div></div>'}</div>`;
}

function miniFindings(findings) {
  if (!findings.length) return '<div class="mini-finding"><small>None</small></div>';
  return `<div class="mini-finding-list">${findings.map((finding) => `<div class=\"mini-finding\"><strong>${esc(finding.ruleId)} · ${esc(finding.title)}</strong><small>${esc(finding.contractName)} · ${esc(finding.file)}:${finding.startLine}</small></div>`).join('')}</div>`;
}

function renderCompare() {
  if (!state.report) return emptyWorkspace();
  const actions = `
    <button class="action-button" data-action="set-baseline">Set current as baseline</button>
    <button class="action-button primary" data-action="compare-hardened">Compare with hardened demo</button>
    <button class="action-button" data-action="import-baseline">Import report JSON</button>`;
  if (!state.baseline) {
    return workspaceHeader('Scan comparison', 'Choose a baseline', 'Save the current scan, import an older report, or compare the vulnerable demo with the hardened implementation.', actions) +
      '<div class="empty-state"><div><strong>No baseline selected</strong><span>Comparison will show resolved, ongoing, and introduced findings.</span></div></div>';
  }
  const comparison = compareReports(state.baseline, state.report);
  return workspaceHeader('Scan comparison', 'Resolved, ongoing, and introduced findings', `Baseline ${shortHash(state.baseline.reportHash)} → current ${shortHash(state.report.reportHash)}`, actions) + `
    <div class="compare-metrics">
      <div class="compare-card"><span>Score delta</span><strong class="${comparison.scoreDelta >= 0 ? 'status-ready' : 'status-blocked'}">${comparison.scoreDelta >= 0 ? '+' : ''}${comparison.scoreDelta}</strong></div>
      <div class="compare-card"><span>Resolved</span><strong class="status-ready">${comparison.summary.resolved}</strong></div>
      <div class="compare-card"><span>Ongoing</span><strong class="status-review">${comparison.summary.ongoing}</strong></div>
      <div class="compare-card"><span>Introduced</span><strong class="status-blocked">${comparison.summary.introduced}</strong></div>
    </div>
    <div class="compare-columns">
      <section class="compare-column"><h4 class="status-ready">Resolved</h4>${miniFindings(comparison.resolved)}</section>
      <section class="compare-column"><h4 class="status-review">Ongoing</h4>${miniFindings(comparison.ongoing)}</section>
      <section class="compare-column"><h4 class="status-blocked">Introduced</h4>${miniFindings(comparison.introduced)}</section>
    </div>`;
}

function renderProof() {
  const report = state.report;
  if (!report) return emptyWorkspace();
  const payload = buildProofPayload(report, '');
  const rehearsal = report.arcDeployRehearsal;
  const rehearsalChecks = rehearsal.checks.map((check) => `<div class="rehearsal-check check-${esc(check.status)}"><span>${check.status === 'pass' ? '✓' : check.status === 'roadmap' ? '◇' : '!'}</span><div><strong>${esc(check.label)}</strong><small title="${esc(check.detail)}">${esc(check.detail)}</small></div><em>${esc(check.status)}</em></div>`).join('');
  return workspaceHeader('Proof Center 3.2', 'Anchor hashes on Arc Testnet', 'Only source hash, report hash, score, URI, version, submitter, and timestamp are written onchain.') + `
    <section class="deploy-rehearsal os-panel">
      <div class="os-panel-head"><div><span>ARC DEPLOY REHEARSAL</span><strong>Stop unsafe deployments before the wallet opens</strong></div><em class="${rehearsal.blocking ? 'status-blocked' : 'status-ready'}">${esc(rehearsal.status)}</em></div>
      <div class="rehearsal-body"><div class="rehearsal-checks">${rehearsalChecks}</div><div class="rehearsal-plan"><span>TRANSACTION PLAN</span><ol>${rehearsal.transactionPlan.map((step) => `<li>${esc(step)}</li>`).join('')}</ol><div class="roadmap-tag">APS: ${esc(rehearsal.apsMode)}</div></div></div>
    </section>
    <div class="proof-layout">
      <section class="proof-card">
        <h4>Arc proof transaction</h4>
        <p>Review the registry and optional report URI. Your wallet will show the final transaction before anything is sent.</p>
        <label class="field-label" for="registry-address">Registry address</label>
        <input id="registry-address" class="text-input" value="${esc(REGISTRY_ADDRESS)}" />
        <label class="field-label" for="report-uri" style="margin-top:12px">Optional report URI</label>
        <input id="report-uri" class="text-input" placeholder="ipfs://… or https://…" />
        <div class="proof-actions">
          <button class="action-button" data-action="connect-wallet">${state.walletAccount ? `Connected ${esc(shortHash(state.walletAccount, 8, 6))}` : 'Connect wallet'}</button>
          <button class="action-button primary" data-action="publish-proof">Publish proof</button>
        </div>
        <div id="proof-result" class="proof-result">No transaction submitted.</div>
      </section>
      <section class="proof-card">
        <h4>Canonical payload</h4>
        <div class="info-list">
          <div class="info-row"><span>Network</span><code>${esc(ARC_TESTNET.chainName)} · ${ARC_TESTNET.chainId}</code></div>
          <div class="info-row"><span>Project ID</span><code title="${payload.projectId}">${esc(shortHash(payload.projectId))}</code></div>
          <div class="info-row"><span>Source hash</span><code title="${payload.sourceHash}">${esc(shortHash(payload.sourceHash))}</code></div>
          <div class="info-row"><span>Report hash</span><code title="${payload.reportHash}">${esc(shortHash(payload.reportHash))}</code></div>
          <div class="info-row"><span>Score</span><code>${payload.score}/100</code></div>
          <div class="info-row"><span>Scanner</span><code>${esc(payload.scannerVersion)}</code></div>
        </div>
        <button class="action-button" data-action="copy-payload">Copy payload JSON</button>
      </section>
    </div>`;
}

function renderExports() {
  if (!state.report) return emptyWorkspace();
  const gate = state.report.privacyGate;
  const gateChecks = gate.checks.map((check) => `<div class="gate-check ${check.pass ? 'gate-pass' : 'gate-fail'}"><span>${check.pass ? '✓' : '!'}</span><div><strong>${esc(check.label)}</strong><small>${esc(String(check.actual))} / target ${esc(String(check.expected))}</small></div></div>`).join('');
  const packs = state.report.rulePacks.map((pack) => `<article class="rule-pack"><span>ACTIVE PACK</span><strong>${esc(pack.label)}</strong><small>${pack.matchedTerms.length ? `Matched: ${esc(pack.matchedTerms.join(', '))}` : 'Universal baseline'}</small><p>${esc(pack.controls.join(' · '))}</p></article>`).join('');
  const cards = [
    ['Canonical Privacy OS JSON', 'Genome, intent, attacks, MRI, forge plan, passport, findings, policies and hashes.', 'export-json', 'Download JSON'],
    ['Markdown report', 'Reviewer-friendly executive summary and remediation evidence.', 'export-markdown', 'Download Markdown'],
    ['Arc Policy Manifest', 'Selector-level Open, Restricted, and Locked recommendations.', 'export-policy', 'Download manifest'],
    ['Privacy CI Gate Kit', 'GitHub workflow, deterministic gate result, active rule packs and source-guided fuzz plan.', 'export-ci-kit', 'Download CI kit'],
    ['Deployment Lineage', 'Portable lineage, Privacy Twin and Arc deployment rehearsal artifacts.', 'export-lineage', 'Download lineage JSON'],
    ['Privacy OS Pack ZIP', 'Complete report, genome, intent, attacks, MRI, forge, passport, proof and source bundle.', 'export-zip', 'Download ZIP'],
  ];
  return workspaceHeader('Deterministic exports', 'Portable privacy engineering outputs', 'Every export is generated locally from the same canonical report.') +
    `<section class="gate-console os-panel"><div class="os-panel-head"><div><span>PRIVACY CI GATE</span><strong>Merge decision: ${esc(gate.status.toUpperCase())}</strong></div><em class="${gate.status === 'passed' ? 'status-ready' : 'status-blocked'}">${gate.failed} failed</em></div><div class="gate-check-grid">${gateChecks}</div></section>
    <section class="ops-grid"><div class="rule-pack-panel"><div class="ops-heading"><span>DOMAIN RULE PACKS</span><strong>${state.report.rulePacks.length} active profiles</strong></div><div class="rule-pack-list">${packs}</div></div><div class="fuzz-panel"><span>SOURCE-GUIDED FUZZ PLAN</span><strong>${state.report.fuzzPlan.summary.vectors}</strong><em>vectors</em><p>${state.report.fuzzPlan.summary.campaigns} selector campaigns generated. Execution remains compiler-backed and explicit.</p><code>${esc(state.report.fuzzPlan.recommendedCommand)}</code></div></section>
    <div class="export-grid">${cards.map(([title, text, action, button]) => `<article class="export-card"><h4>${title}</h4><p>${text}</p><button class="action-button primary" data-action="${action}">${button}</button></article>`).join('')}</div>`;
}

function renderHistory() {
  const actions = state.history.length ? '<button class="action-button" data-action="clear-history">Clear local history</button>' : '';
  const items = state.history.map((item, index) => `
    <article class="history-card">
      <div><strong>${esc(item.label)} · ${item.report.score}/100 · ${esc(item.report.status)}</strong><small>${new Date(item.savedAt).toLocaleString()} · ${esc(shortHash(item.report.reportHash))}</small></div>
      <div class="history-actions"><button class="action-button" data-action="history-baseline" data-index="${index}">Use baseline</button><button class="action-button" data-action="history-open" data-index="${index}">Open</button></div>
    </article>`).join('');
  return workspaceHeader('Local scan history', 'Private browser history', 'History remains in localStorage on this device. Clear it at any time.', actions) +
    `<div class="history-list">${items || '<div class="empty-state"><div><strong>No saved scan</strong><span>Completed scans will appear here without uploading source code.</span></div></div>'}</div>`;
}

function buildReleaseGateSnapshot() {
  const report = state.report;
  const xray = state.projectXray;
  const evidence = evaluateDeploymentEvidence({ report, evidence: state.deploymentEvidence });
  const bytecodeTruth = state.bytecodeTruth.verification;
  const proofLab = state.report ? currentProofLabSnapshot() : null;
  const checks = [
    { id: 'scope', label: 'Project scan scope', detail: `${state.files.length} source file${state.files.length === 1 ? '' : 's'} selected`, status: state.files.length ? 'pass' : 'block' },
    { id: 'entry', label: 'Deployable entry contract', detail: xray ? `${xray.entryContracts.length} detected` : 'Project source inventory unavailable', status: xray?.entryContracts.length ? 'pass' : 'review' },
    ...(report?.privacyGate?.checks || []).map((check) => ({ id: `privacy-${check.id}`, label: check.label, detail: `${check.actual} / target ${check.expected}`, status: check.pass ? 'pass' : 'block' })),
    { id: 'passport', label: 'Source-bound Privacy Passport', detail: report?.privacyPassport?.status || 'Unavailable', status: report?.privacyPassport?.status === 'Active' ? 'pass' : report?.privacyPassport ? 'block' : 'review' },
    { id: 'imports', label: 'External dependency review', detail: xray?.externalImports.length ? `${xray.externalImports.length} external import${xray.externalImports.length === 1 ? '' : 's'} require compiler resolution` : 'No unresolved external import signal', status: xray?.externalImports.length ? 'review' : 'pass' },
    { id: 'evidence', label: 'Arc deployment evidence', detail: evidence.status, status: evidence.valid ? 'pass' : 'review' },
    { id: 'bytecode-truth', label: 'Source-to-chain bytecode identity', detail: bytecodeTruth?.status || 'Verification not run', status: bytecodeTruth?.verified ? 'pass' : bytecodeTruth ? 'block' : 'review' },
    { id: 'proof-of-fix', label: 'Executable Proof of Fix', detail: proofLab?.decision || 'Proof Lab not evaluated', status: proofLab?.decision === 'FIX PROVEN' ? 'pass' : proofLab?.decision === 'BLOCKED' ? 'block' : 'review' },
  ];
  const blocked = checks.filter((check) => check.status === 'block').length;
  const review = checks.filter((check) => check.status === 'review').length;
  const decision = blocked ? 'BLOCKED' : review ? 'REVIEW' : 'READY';
  const actions = [];
  if (report?.summary?.critical) actions.push({ priority: 'P0', title: `Resolve ${report.summary.critical} critical finding${report.summary.critical === 1 ? '' : 's'}`, owner: 'Security' });
  if (report?.summary?.high) actions.push({ priority: 'P1', title: `Treat ${report.summary.high} high finding${report.summary.high === 1 ? '' : 's'}`, owner: 'Engineering' });
  if ((report?.privacyIntent?.complianceScore || 0) < 90) actions.push({ priority: 'P1', title: 'Raise intent compliance to at least 90', owner: 'Privacy' });
  if (xray?.externalImports.length) actions.push({ priority: 'P2', title: 'Compile and resolve external dependency imports', owner: 'Build' });
  if (!evidence.valid) actions.push({ priority: 'P3', title: 'Link Arc deployment evidence after broadcast', owner: 'Release' });
  if (!bytecodeTruth?.verified) actions.push({ priority: bytecodeTruth ? 'P0' : 'P3', title: bytecodeTruth ? 'Resolve Arc bytecode mismatch' : 'Verify deployed bytecode against compiler artifact', owner: 'Release' });
  if (proofLab?.decision !== 'FIX PROVEN') actions.push({ priority: proofLab?.decision === 'BLOCKED' ? 'P0' : 'P2', title: 'Complete compiler-backed Proof of Fix evidence', owner: 'QA' });
  if (!actions.length) actions.push({ priority: 'PASS', title: 'All deterministic release controls passed', owner: 'Release' });
  return {
    version: '3.2-release-gate',
    decision,
    blocked,
    review,
    passed: checks.filter((check) => check.status === 'pass').length,
    project: elements.projectName.value || 'Solidity project',
    sourceHash: report?.sourceHash || null,
    reportHash: report?.reportHash || null,
    framework: xray?.framework || 'Unavailable',
    checks,
    actions,
    ciCommand: 'node packages/analyzer/cli.mjs scan contracts --format json --output veilforge-report.json --gate',
  };
}

function currentProofLabSnapshot() {
  return buildProofLabSnapshot({
    report: state.report,
    projectXray: state.projectXray,
    artifact: state.bytecodeTruth.artifact,
    bytecodeVerification: state.bytecodeTruth.verification,
    receipt: state.proofLab.receipt,
    receiptName: state.proofLab.receiptFileName,
    hash: keccakHex,
  });
}

function renderProofLab() {
  if (!state.report) return emptyWorkspace('Run a scan before Proof Lab', 'Proof Lab binds compiler, regression, fuzz, storage-layout and Arc bytecode evidence to the active source hash.');
  const proof = currentProofLabSnapshot();
  state.proofLab.snapshot = proof;
  const checks = proof.checks.map((check, index) => `<article class="proof-lab-check lab-${check.status}"><b>${String(index + 1).padStart(2, '0')}</b><span>${check.status === 'pass' ? '✓' : check.status === 'block' ? '!' : '·'}</span><div><strong>${esc(check.label)}</strong><small>${esc(check.detail)}</small></div><em>${esc(check.status)}</em></article>`).join('');
  const receipt = proof.receipt;
  const statusClassName = proof.decision === 'FIX PROVEN' ? 'proven' : proof.decision === 'BLOCKED' ? 'blocked' : 'evidence';
  const runbook = [
    ['01', 'Baseline', 'Canonical scan and findings frozen', Boolean(state.report)],
    ['02', 'Forge', 'Candidate patch scope prepared', state.report.forgePlan.summary.candidateReady > 0 || state.report.forgePlan.summary.total === 0],
    ['03', 'Execute', receipt ? `${receipt.framework} receipt imported` : 'Run the exported Proof Kit locally', Boolean(receipt)],
    ['04', 'Verify', state.bytecodeTruth.verification?.verified ? 'Arc bytecode identity proven' : 'Bytecode Truth required', Boolean(state.bytecodeTruth.verification?.verified)],
    ['05', 'Attest', proof.decision, proof.decision === 'FIX PROVEN'],
  ].map(([number, title, detail, done]) => `<div class="proof-lab-stage ${done ? 'stage-done' : ''}"><b>${number}</b><div><strong>${esc(title)}</strong><small>${esc(detail)}</small></div><span>${done ? '✓' : '—'}</span></div>`).join('');
  return workspaceHeader('Proof Lab', 'Executable Proof of Fix', 'Turn a proposed remediation into compiler-backed evidence. VeilForge imports real Foundry/Hardhat results; it never invents a passing test.', `<button class="action-button" data-action="download-proof-kit">Download Proof Kit</button><label class="action-button proof-receipt-upload">Import test receipt<input id="proof-lab-receipt-input" type="file" accept=".json,application/json"></label><button class="action-button primary" data-action="export-proof-attestation">Download attestation</button>`) + `
    <section class="proof-lab-hero proof-${statusClassName}"><div><span>PROOF OF FIX</span><strong>${esc(proof.decision)}</strong><p>${proof.blocked} blocked · ${proof.review} evidence required · ${proof.passed} passed</p></div><div class="proof-lab-id"><span>PROOF ID</span><code>${esc(shortHash(proof.proofId, 14, 10))}</code></div></section>
    <div class="proof-lab-stages">${runbook}</div>
    <div class="proof-lab-grid"><section><header><span>EXECUTABLE CONTROL MATRIX</span><strong>${proof.checks.length} deterministic checks</strong></header><div class="proof-lab-checks">${checks}</div></section><section class="proof-lab-console"><header><span>TEST RECEIPT</span><strong>${receipt ? esc(state.proofLab.receiptFileName) : 'Awaiting execution'}</strong></header>${receipt ? `<div class="proof-lab-metrics"><div><span>Compile</span><strong>${receipt.compilationPassed ? 'PASS' : 'FAIL'}</strong></div><div><span>Tests</span><strong>${receipt.tests.passed}/${receipt.tests.total}</strong></div><div><span>Fuzz</span><strong>${receipt.fuzz.runs}</strong></div><div><span>Storage</span><strong>${receipt.storageLayoutSafe == null ? 'N/A' : receipt.storageLayoutSafe ? 'SAFE' : 'FAIL'}</strong></div></div>` : '<p>Download the kit, run the Foundry or Hardhat command in the project, then import its JSON receipt here.</p>'}<div class="proof-command"><span>FOUNDRY</span><code>${esc(proof.commands.foundry)}</code><button data-action="copy-proof-command" data-command="foundry">Copy</button></div><div class="proof-command"><span>HARDHAT</span><code>${esc(proof.commands.hardhat)}</code><button data-action="copy-proof-command" data-command="hardhat">Copy</button></div></section></div>
    ${state.proofLab.error ? `<p class="proof-lab-error">${esc(state.proofLab.error)}</p>` : ''}
    <p class="proof-lab-honesty">A JSON receipt proves what the imported runner reported and is bound to this local attestation. Maximum assurance requires the receipt source hash plus ARC VERIFIED Bytecode Truth.</p>`;
}

function bytecodeTruthStatusClass(status) {
  if (status === 'ARC VERIFIED') return 'verified';
  if (status === 'STRUCTURAL MATCH') return 'structural';
  if (status === 'MISMATCH') return 'mismatch';
  return 'unverified';
}

function renderBytecodeTruth() {
  const truth = state.bytecodeTruth;
  const artifact = truth.artifact;
  const result = truth.verification;
  const status = result?.status || 'UNVERIFIED';
  const hashRows = [
    ['Compiler artifact', result?.artifactHash],
    ['Arc target', result?.targetHash],
    ['Proxy implementation', result?.implementationHash],
  ].filter(([, value]) => value).map(([label, value]) => `<div class="truth-hash-row"><span>${esc(label)}</span><code>${esc(value)}</code></div>`).join('');
  const artifactCard = artifact ? `
    <section class="bytecode-card artifact-card"><header><span>COMPILER ARTIFACT</span><strong>${esc(truth.artifactFileName)}</strong></header>
      <div class="truth-facts"><div><span>Contract</span><strong>${esc(artifact.contractName)}</strong></div><div><span>Source</span><strong>${esc(artifact.sourceName)}</strong></div><div><span>Compiler</span><strong>${esc(artifact.compilerVersion)}</strong></div><div><span>Optimizer</span><strong>${artifact.optimizer ? `${artifact.optimizer.enabled ? 'On' : 'Off'} · ${artifact.optimizer.runs} runs` : 'Unknown'}</strong></div></div>
      <button class="action-button" data-action="clear-bytecode-artifact">Remove artifact</button>
    </section>` : `
    <section class="bytecode-card artifact-card empty-artifact"><span>COMPILER ARTIFACT</span><strong>Foundry or Hardhat JSON</strong><p>Upload a build artifact containing deployed runtime bytecode. Source code never leaves this browser.</p></section>`;
  const proxy = result?.implementationAddress ? `<div class="proxy-route"><span>ERC-1967 PROXY ROUTE</span><code>${esc(result.targetAddress)}</code><b>→</b><code>${esc(result.implementationAddress)}</code></div>` : '';
  return workspaceHeader('Bytecode Truth', 'Prove source-to-chain identity', 'Compare a Foundry or Hardhat compiler artifact with live runtime bytecode on Arc. Exact, metadata-aware and ERC-1967 proxy verification are performed locally.', `<label class="action-button bytecode-upload">Load artifact<input id="bytecode-artifact-input" type="file" accept=".json,application/json"></label>${result ? '<button class="action-button primary" data-action="export-bytecode-attestation">Download attestation</button>' : ''}`) + `
    <section class="bytecode-hero truth-${bytecodeTruthStatusClass(status)}"><div><span>CHAIN IDENTITY</span><strong>${esc(status)}</strong><p>${status === 'ARC VERIFIED' ? 'Full deployed runtime bytecode matches the compiler artifact byte-for-byte.' : status === 'STRUCTURAL MATCH' ? 'Executable runtime matches after Solidity metadata and immutable slots are normalized.' : status === 'MISMATCH' ? 'The Arc runtime does not match this compiler artifact.' : 'Load an artifact and verify a deployed Arc contract.'}</p></div><div class="truth-seal"><b>${result?.verified ? '✓' : '?'}</b><span>${result?.matchedKind ? esc(result.matchedKind) : 'awaiting proof'}</span></div></section>
    <div class="bytecode-layout">
      ${artifactCard}
      <section class="bytecode-card verify-card"><header><span>LIVE ARC QUERY</span><strong>Runtime bytecode</strong></header><div class="bytecode-fields"><label><span>Contract address</span><input id="bytecode-target-address" class="text-input" placeholder="0x…" value="${esc(result?.targetAddress || state.deploymentEvidence.contractAddress || '')}"></label><label><span>RPC endpoint</span><input id="bytecode-rpc-url" class="text-input" value="${esc(result?.rpcUrl || ARC_TESTNET.rpcUrls[0])}"></label></div><button class="action-button primary verify-bytecode-button" data-action="verify-bytecode" ${artifact ? '' : 'disabled'}>Verify on Arc</button><small>Checks eth_chainId first, then reads eth_getCode and the ERC-1967 implementation slot. No wallet or transaction is required.</small></section>
    </div>
    ${proxy}
    ${hashRows ? `<section class="truth-hashes"><header><span>CRYPTOGRAPHIC RECEIPT</span><strong>Keccak-256 fingerprints</strong></header>${hashRows}</section>` : ''}
    ${truth.error ? `<p class="bytecode-error">${esc(truth.error)}</p>` : ''}
    <div class="truth-legend"><div><b>Exact</b><span>Entire deployed bytecode, including compiler metadata, is identical.</span></div><div><b>Structural</b><span>Executable runtime is identical after metadata and immutable normalization.</span></div><div><b>Scope</b><span>Artifact-to-chain identity proof; it does not replace a formal security audit.</span></div></div>`;
}

async function bytecodeRpcCall(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }) });
  if (!response.ok) throw new Error(`Arc RPC returned HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || `Arc RPC ${method} failed.`);
  return payload.result;
}

async function loadBytecodeArtifact(file) {
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) throw new Error('Artifact is too large (12 MB maximum).');
  const artifact = parseBytecodeArtifact(await file.text(), file.name);
  state.bytecodeTruth = { artifact, artifactFileName: file.name, verification: null, error: null };
  renderWorkspace();
  setMessage(`${artifact.contractName} compiler artifact loaded.`, 'success');
}

async function verifyArcBytecode() {
  const artifact = state.bytecodeTruth.artifact;
  if (!artifact) throw new Error('Load a Foundry or Hardhat artifact first.');
  const targetAddress = document.querySelector('#bytecode-target-address')?.value.trim();
  const rpcUrl = document.querySelector('#bytecode-rpc-url')?.value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(targetAddress || '')) throw new Error('Enter a valid deployed contract address.');
  if (!/^https?:\/\//i.test(rpcUrl || '')) throw new Error('Enter a valid Arc RPC URL.');
  state.bytecodeTruth.verification = null;
  state.bytecodeTruth.error = null;
  setMessage('Confirming Arc Testnet before reading runtime bytecode…');
  try {
    const rpcChainId = await bytecodeRpcCall(rpcUrl, 'eth_chainId', []);
    const chainIdHex = assertRpcChainId(rpcChainId, ARC_TESTNET.chainIdHex, `${ARC_TESTNET.chainName} chain ${ARC_TESTNET.chainId}`);
    setMessage('Arc Testnet confirmed. Reading live runtime bytecode…');
    const targetBytecode = await bytecodeRpcCall(rpcUrl, 'eth_getCode', [targetAddress, 'latest']);
    let implementationAddress = null;
    try {
      const slot = await bytecodeRpcCall(rpcUrl, 'eth_getStorageAt', [targetAddress, EIP1967_IMPLEMENTATION_SLOT, 'latest']);
      implementationAddress = implementationAddressFromStorage(slot);
    } catch { implementationAddress = null; }
    const implementationBytecode = implementationAddress ? await bytecodeRpcCall(rpcUrl, 'eth_getCode', [implementationAddress, 'latest']) : null;
    const verification = verifyBytecodeTruth({ artifact, targetBytecode, implementationBytecode, targetAddress, implementationAddress, hash: keccakHex });
    state.bytecodeTruth.verification = { ...verification, rpcUrl, chainId: ARC_TESTNET.chainId, chainIdHex, verifiedAt: new Date().toISOString(), sourceHash: state.report?.sourceHash || null, reportHash: state.report?.reportHash || null };
    state.bytecodeTruth.error = null;
    renderWorkspace();
    setMessage(verification.verified ? `${verification.status}: Arc runtime identity proven.` : 'Bytecode mismatch detected.', verification.verified ? 'success' : 'error');
  } catch (error) {
    state.bytecodeTruth.error = error instanceof Error ? error.message : String(error);
    renderWorkspace();
    throw error;
  }
}

function renderReleaseGate() {
  if (!state.report) return emptyWorkspace('Run a scan before release gating', 'Release Gate combines Project X-Ray, privacy findings, intent, passport and Arc deployment evidence.');
  const gate = buildReleaseGateSnapshot();
  const checks = gate.checks.map((check) => `<article class="release-check release-${check.status}"><span>${check.status === 'pass' ? '✓' : check.status === 'block' ? '!' : '•'}</span><div><strong>${esc(check.label)}</strong><small>${esc(check.detail)}</small></div><em>${esc(check.status)}</em></article>`).join('');
  const actions = gate.actions.map((item, index) => `<article class="release-action"><b>${String(index + 1).padStart(2, '0')}</b><span class="priority-${esc(item.priority)}">${esc(item.priority)}</span><div><strong>${esc(item.title)}</strong><small>${esc(item.owner)}</small></div></article>`).join('');
  const stages = [
    ['Project', state.projectXray ? 'pass' : 'review', state.projectXray?.framework || 'Source inventory'],
    ['Privacy', state.report.privacyGate.status === 'passed' ? 'pass' : 'block', `${state.report.privacyGate.failed} failed controls`],
    ['Passport', state.report.privacyPassport.status === 'Active' ? 'pass' : 'block', state.report.privacyPassport.status],
    ['Arc release', gate.decision === 'READY' ? 'pass' : gate.decision === 'BLOCKED' ? 'block' : 'review', gate.decision],
  ].map(([label, status, detail], index) => `<div class="release-stage stage-${status}"><b>${String(index + 1).padStart(2, '0')}</b><span>${esc(label)}</span><small>${esc(detail)}</small></div>`).join('');
  return workspaceHeader('Release Gate', 'Can this project ship?', 'One deterministic decision assembled from source scope, privacy controls, passport validity and Arc evidence.', `<button class="action-button" data-action="copy-release-command">Copy CI command</button><button class="action-button primary" data-action="export-release-gate">Download gate JSON</button>`) + `
    <section class="release-hero decision-${gate.decision.toLowerCase()}">
      <div><span>FINAL DECISION</span><strong>${esc(gate.decision)}</strong><p>${gate.blocked ? `${gate.blocked} blocking control${gate.blocked === 1 ? '' : 's'} must pass before deployment.` : gate.review ? `${gate.review} review item${gate.review === 1 ? '' : 's'} remain before release.` : 'All deterministic release controls passed.'}</p></div>
      <div class="release-score"><strong>${gate.passed}</strong><span>passed</span><small>${gate.checks.length} total checks</small></div>
    </section>
    <div class="release-stages">${stages}</div>
    <div class="release-grid"><section><header><span>CONTROL MATRIX</span><strong>${gate.blocked} blocked · ${gate.review} review</strong></header><div class="release-checks">${checks}</div></section><section><header><span>SHIP LIST</span><strong>Ordered next actions</strong></header><div class="release-actions">${actions}</div></section></div>
    <div class="release-command"><span>CI ENFORCEMENT</span><code>${esc(gate.ciCommand)}</code></div>`;
}

function renderWorkspace() {
  const views = {
    triage: renderTriage,
    genome: renderGenome,
    intent: renderIntent,
    shadow: renderShadow,
    mri: renderMRI,
    forge: renderForge,
    chains: renderChains,
    treatment: renderTreatment,
    compare: renderCompare,
    proof: renderProof,
    passport: renderPassport,
    exports: renderExports,
    history: renderHistory,
    release: renderReleaseGate,
    bytecode: renderBytecodeTruth,
    prooftest: renderProofLab,
  };
  elements.workspace.innerHTML = (views[state.activeView] ?? renderTriage)();
}

function renderAll() {
  renderSummary();
  renderWorkspace();
  document.querySelectorAll('.nav-button').forEach((button) => button.classList.toggle('active', button.dataset.view === state.activeView));
  if (state.report) {
    document.body.dataset.reportHash = state.report.reportHash;
    document.body.dataset.projectStatus = state.report.status;
  }
}

function renderDetectorSeveritySummary(report) {
  if (!elements.detectorSeveritySummary) return;
  const severityOrbits = [
    { severity: 'critical', orbit: 108, offset: -90 },
    { severity: 'high', orbit: 76, offset: -74 },
    { severity: 'medium', orbit: 45, offset: -48 },
  ];
  const dots = severityOrbits.flatMap(({ severity, orbit, offset }) => {
    const count = report.findings.filter((finding) => finding.severity === severity).length;
    return Array.from({ length: count }, (_, index) => ({
      severity,
      orbit,
      angle: offset + ((360 / Math.max(count, 1)) * index),
    }));
  });
  elements.detectorSeveritySummary.innerHTML = dots.map(({ severity, orbit, angle }) => `<span class="severity-dot severity-${severity}" style="--orbit:${orbit}px;--angle:${angle}deg" title="${severity}"></span>`).join('');
  elements.detectorSeveritySummary.setAttribute('aria-label', `${report.summary.total} findings: ${severityOrbits.map(({ severity }) => `${report.findings.filter((finding) => finding.severity === severity).length} ${severity}`).join(', ')}.`);
}

function clearDetectorSeveritySummary() {
  if (detectorClearTimer) clearTimeout(detectorClearTimer);
  if (elements.detectorFindings) elements.detectorFindings.innerHTML = '';
  if (!elements.detectorSeveritySummary) return;
  elements.detectorSeveritySummary.innerHTML = '';
  elements.detectorSeveritySummary.setAttribute('aria-label', 'No findings displayed.');
}

async function loadFilesAndScan(fileList) {
  try {
    setMessage('Inspecting the contract or project locally…');
    const files = await readBrowserFiles(fileList);
    if (!files.length) {
      setFiles([], { announce: false });
      setMessage('No Solidity contracts found. Upload a contract file, a ZIP project, or a project folder containing Solidity source.', 'error');
      return;
    }
    setFiles(files, { announce: false });
    runScan();
  } catch (error) {
    setFiles([], { announce: false });
    setMessage(error instanceof Error ? error.message : String(error), 'error');
  }
}

function runScan() {
  if (!state.files.length) {
    clearDetectorSeveritySummary();
    setMessage('Add at least one Solidity file before scanning.', 'error');
    return;
  }
  elements.scanButton.disabled = true;
  elements.scanButton.classList.add('scanning');
  elements.scanVisualizer?.classList.add('active');
  elements.scanVisualizer?.setAttribute('aria-hidden', 'false');
  if (detectorClearTimer) clearTimeout(detectorClearTimer);
  if (elements.detectorFindings) elements.detectorFindings.innerHTML = '';
  setMessage('Running local deterministic analysis…');
  try {
    state.report = scanProject(state.files, { declaredIntent: state.intentDeclaration });
    saveCurrentToHistory();
    renderAll();
    renderDetectorSeveritySummary(state.report);
    if (elements.detectorFindings) {
      const detected = state.report.findings.filter((finding) => finding.severity === 'critical').slice(0, 4);
      elements.detectorFindings.innerHTML = detected.map((finding, index) => `<article style="--delay:${index * 140}ms"><span>CRITICAL</span><b>${esc(finding.ruleId)}</b><small>${esc(finding.title)}</small></article>`).join('');
      detectorClearTimer = setTimeout(() => {
        elements.detectorFindings?.classList.add('clearing');
        setTimeout(() => {
          if (elements.detectorFindings) elements.detectorFindings.innerHTML = '';
          elements.detectorFindings?.classList.remove('clearing');
        }, 450);
      }, 4600);
    }
    setMessage(`${state.report.status}: ${state.report.summary.total} finding${state.report.summary.total === 1 ? '' : 's'}, report ${shortHash(state.report.reportHash)}.`, 'success');
  } catch (error) {
    console.error(error);
    setMessage(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    elements.scanButton.disabled = false;
    elements.scanButton.classList.remove('scanning');
  }
}

function download(name, data, mime = 'application/octet-stream') {
  const blob = data instanceof Blob
    ? data
    : new Blob([data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function exportName(extension) {
  return `${slugify(elements.projectName.value)}-veilforge-v3.2.${extension}`;
}

function exportJson() {
  download(exportName('json'), JSON.stringify(state.report, null, 2), 'application/json');
}

function exportMarkdown() {
  download(exportName('md'), formatMarkdownReport(state.report, elements.projectName.value), 'text/markdown');
}

function exportPolicy() {
  download(`${slugify(elements.projectName.value)}-arc-policy-manifest.json`, JSON.stringify(generatePolicyManifest(state.report), null, 2), 'application/json');
}

function exportCiKit() {
  const project = slugify(elements.projectName.value);
  const entries = [
    { name: '.github/workflows/veilforge-privacy-gate.yml', data: state.report.privacyGate.workflow },
    { name: 'veilforge/privacy-gate.json', data: JSON.stringify(state.report.privacyGate, null, 2) },
    { name: 'veilforge/rule-packs.json', data: JSON.stringify(state.report.rulePacks, null, 2) },
    { name: 'veilforge/source-guided-fuzz-plan.json', data: JSON.stringify(state.report.fuzzPlan, null, 2) },
    { name: 'README.md', data: `# VeilForge Privacy CI Gate\n\nCopy the workflow and VeilForge analyzer into your repository. The gate fails with exit code 2 when required privacy checks do not pass. The fuzz artifact is a source-guided plan and must be executed with a compiler-backed Foundry suite.\n` },
  ];
  download(`${project}-veilforge-ci-gate.zip`, createZip(entries), 'application/zip');
}

function exportZip() {
  const project = slugify(elements.projectName.value);
  const policy = generatePolicyManifest(state.report);
  const proof = buildProofPayload(state.report, '');
  const sourceNote = state.files.length
    ? `${state.files.length} matching Solidity source file${state.files.length === 1 ? '' : 's'} included in source/.`
    : 'Original Solidity source files were unavailable for this historical report and are not included.';
  const entries = [
    { name: 'report/veilforge-report.json', data: JSON.stringify(state.report, null, 2) },
    { name: 'report/veilforge-report.md', data: formatMarkdownReport(state.report, elements.projectName.value) },
    { name: 'policy/arc-policy-manifest.json', data: JSON.stringify(policy, null, 2) },
    { name: 'treatment/treatment-plan.json', data: JSON.stringify(state.report.treatmentPlan, null, 2) },
    { name: 'genome/privacy-genome.json', data: JSON.stringify(state.report.privacyGenome, null, 2) },
    { name: 'intent/privacy-intent.yaml', data: state.report.privacyIntent.document },
    { name: 'shadow/attack-lab.json', data: JSON.stringify(state.report.attackLab, null, 2) },
    { name: 'mri/transaction-mri.json', data: JSON.stringify(state.report.transactionMRI, null, 2) },
    { name: 'forge/forge-plan.json', data: JSON.stringify(state.report.forgePlan, null, 2) },
    { name: 'twin/privacy-deployment-twin.json', data: JSON.stringify(state.report.privacyTwin, null, 2) },
    { name: 'lineage/deployment-lineage.json', data: JSON.stringify(state.report.deploymentLineage, null, 2) },
    { name: 'passport/privacy-passport.json', data: JSON.stringify(state.report.privacyPassport, null, 2) },
    { name: 'deployment/arc-deploy-rehearsal.json', data: JSON.stringify(state.report.arcDeployRehearsal, null, 2) },
    { name: 'ci/privacy-gate.json', data: JSON.stringify(state.report.privacyGate, null, 2) },
    { name: 'ci/rule-packs.json', data: JSON.stringify(state.report.rulePacks, null, 2) },
    { name: 'ci/source-guided-fuzz-plan.json', data: JSON.stringify(state.report.fuzzPlan, null, 2) },
    { name: '.github/workflows/veilforge-privacy-gate.yml', data: state.report.privacyGate.workflow },
    { name: 'proof/arc-proof-payload.json', data: JSON.stringify(proof, null, 2) },
    { name: 'proof/proof-of-fix.json', data: JSON.stringify(currentProofLabSnapshot(), null, 2) },
    { name: 'README.txt', data: `Generated locally by VeilForge v3.2 Ascension Privacy Operating System. Source code was not sent to an AI model or remote analyzer. APS output is a roadmap readiness simulation, not live confidential execution.\n${sourceNote}\n` },
    ...state.files.map((file) => ({ name: `source/${file.path}`, data: file.content })),
  ];
  download(`${project}-privacy-os-pack.zip`, createZip(entries), 'application/zip');
}

function exportProofLabKit() {
  const project = slugify(elements.projectName.value);
  const proof = currentProofLabSnapshot();
  const candidates = applyForgeCandidates(state.files, state.report.forgePlan);
  const request = {
    version: '3.2-proof-request',
    project: elements.projectName.value || 'Solidity project',
    sourceHash: state.report.sourceHash,
    reportHash: state.report.reportHash,
    framework: state.projectXray?.framework || 'Unknown',
    upgradeable: Boolean(state.projectXray?.upgradeable),
    expectedMinimumFuzzRuns: 1024,
    commands: proof.commands,
    receiptSchema: {
      framework: 'Foundry or Hardhat',
      sourceHash: state.report.sourceHash,
      compilation: { success: true },
      tests: { total: 1, passed: 1, failed: 0, skipped: 0 },
      fuzz: { runs: 1024, failures: 0 },
      storageLayout: { safe: !state.projectXray?.upgradeable },
    },
  };
  const readme = `# VeilForge Proof Lab Kit\n\nThis kit does not claim that tests were executed in the browser. Run the matching command in the actual project, preserve its JSON output, and import the receipt into Proof Lab.\n\n## Foundry\n\n${proof.commands.foundry}\n\n## Hardhat\n\n${proof.commands.hardhat}\n\nFor the strongest source binding, wrap the runner output with the receipt schema in veilforge/proof-request.json and retain the canonical sourceHash.\n`;
  download(`${project}-veilforge-proof-lab.zip`, createZip([
    { name: 'README.md', data: readme },
    { name: 'veilforge/proof-request.json', data: JSON.stringify(request, null, 2) },
    { name: 'veilforge/source-guided-fuzz-plan.json', data: JSON.stringify(state.report.fuzzPlan, null, 2) },
    { name: 'veilforge/forge-plan.json', data: JSON.stringify(state.report.forgePlan, null, 2) },
    { name: 'veilforge/applied-candidates.json', data: JSON.stringify(candidates.applied, null, 2) },
    ...candidates.files.map((file) => ({ name: `candidate-source/${file.path}`, data: file.content })),
  ]), 'application/zip');
}

async function loadProofLabReceipt(file) {
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) throw new Error('Test receipt is too large (12 MB maximum).');
  try {
    const receipt = parseProofLabReceipt(await file.text(), file.name);
    state.proofLab = { receipt, receiptFileName: file.name, snapshot: null, error: null };
    state.proofLab.snapshot = currentProofLabSnapshot();
    renderWorkspace();
    setMessage(`${receipt.framework} test receipt imported: ${receipt.tests.passed}/${receipt.tests.total} passed.`, receipt.tests.failed ? 'error' : 'success');
  } catch (error) {
    state.proofLab.error = error instanceof Error ? error.message : String(error);
    renderWorkspace();
    throw error;
  }
}

function exportForgeZip() {
  const project = slugify(elements.projectName.value);
  const result = applyForgeCandidates(state.files, state.report.forgePlan);
  const entries = [
    { name: 'VEILFORGE_CANDIDATE_NOTICE.md', data: '# VeilForge candidate hardening bundle\n\nThese files contain deterministic candidate edits only. They are not compiler-verified and must be reviewed, compiled and tested before deployment.\n' },
    { name: 'veilforge/forge-plan.json', data: JSON.stringify(state.report.forgePlan, null, 2) },
    { name: 'veilforge/applied-candidates.json', data: JSON.stringify(result.applied, null, 2) },
    { name: 'veilforge/privacy-intent.yaml', data: state.report.privacyIntent.document },
    { name: 'veilforge/privacy-passport.json', data: JSON.stringify(state.report.privacyPassport, null, 2) },
    ...result.files.map((file) => ({ name: `candidate-source/${file.path}`, data: file.content })),
  ];
  download(`${project}-veilforge-forge-candidates.zip`, createZip(entries), 'application/zip');
}

async function importBaseline() {
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = '.json,application/json';
  picker.addEventListener('change', async () => {
    try {
      const file = picker.files?.[0];
      if (!file) return;
      const report = JSON.parse(await file.text());
      if (!report.reportHash || !Array.isArray(report.findings)) throw new Error('This is not a VeilForge report JSON.');
      state.baseline = report;
      renderWorkspace();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error), 'error');
    }
  });
  picker.click();
}

function playAttackReplay() {
  const frames = [...elements.workspace.querySelectorAll('.cinema-frame')];
  if (!frames.length) return;
  if (state.replayTimer) clearInterval(state.replayTimer);
  frames.forEach((frame) => frame.classList.remove('active', 'passed'));
  let index = 0;
  frames[index].classList.add('active');
  state.replayTimer = setInterval(() => {
    frames[index]?.classList.remove('active');
    frames[index]?.classList.add('passed');
    index += 1;
    if (index >= frames.length) {
      clearInterval(state.replayTimer);
      state.replayTimer = null;
      elements.workspace.querySelector('.replay-cinema')?.classList.add('replay-complete');
      return;
    }
    frames[index].classList.add('active');
  }, 650);
}

async function handleWorkspaceAction(button) {
  const action = button.dataset.action;
  if (action === 'set-baseline') {
    state.baseline = structuredClone(state.report);
    renderWorkspace();
  } else if (action === 'compare-hardened') {
    state.baseline = structuredClone(state.report);
    await loadDemo('hardened');
    runScan();
    state.activeView = 'compare';
    renderAll();
  } else if (action === 'import-baseline') {
    importBaseline();
  } else if (action === 'connect-wallet') {
    const result = document.querySelector('#proof-result');
    await beginWalletConnection({ resultElement: result, openSessionWhenConnected: false });
  } else if (action === 'publish-proof') {
    const result = document.querySelector('#proof-result');
    try {
      if (result) result.textContent = 'Checking payload and waiting for wallet confirmation…';
      const response = await publishReport({
        provider: state.walletProvider,
        registryAddress: document.querySelector('#registry-address')?.value,
        account: state.walletAccount,
        report: state.report,
        reportURI: document.querySelector('#report-uri')?.value.trim() || '',
        onTransactionHash: ({ transactionHash, explorerUrl }) => {
          if (!result) return;
          result.innerHTML = `Transaction submitted. Waiting for Arc confirmation… <a href="${esc(explorerUrl)}" target="_blank" rel="noreferrer">${esc(shortHash(transactionHash, 10, 8))}</a>`;
        },
      });
      state.walletAccount = response.account;
      setWalletUi(response.account);
      if (result) result.innerHTML = `Confirmed on Arc Testnet: <a href="${esc(response.explorerUrl)}" target="_blank" rel="noreferrer">${esc(shortHash(response.transactionHash, 10, 8))}</a>`;
    } catch (error) {
      if (!result) return;
      const message = error instanceof Error ? error.message : String(error);
      if (error?.explorerUrl) {
        result.innerHTML = `${esc(message)} <a href="${esc(error.explorerUrl)}" target="_blank" rel="noreferrer">View transaction on ArcScan</a>`;
      } else {
        result.textContent = message;
      }
    }
  } else if (action === 'copy-payload') {
    await navigator.clipboard.writeText(JSON.stringify(buildProofPayload(state.report, document.querySelector('#report-uri')?.value || ''), null, 2));
    setMessage('Proof payload copied.', 'success');
  } else if (action === 'apply-intent') {
    safeStorageSet(INTENT_KEY, JSON.stringify(state.intentDeclaration));
    runScan();
    state.activeView = 'intent';
    renderAll();
    setMessage('Declared privacy policy compiled into a fresh canonical report.', 'success');
  } else if (action === 'play-attack-replay') {
    playAttackReplay();
  } else if (action === 'link-deployment-evidence') {
    state.deploymentEvidence = {
      projectId: state.report.projectId,
      sourceHash: state.report.sourceHash,
      chainId: ARC_TESTNET.chainId,
      contractAddress: document.querySelector('#deployment-address')?.value.trim() || '',
      transactionHash: document.querySelector('#deployment-tx')?.value.trim() || '',
      bytecodeHash: document.querySelector('#deployment-bytecode')?.value.trim() || '',
    };
    safeStorageSet(DEPLOYMENT_EVIDENCE_KEY, JSON.stringify(state.deploymentEvidence));
    renderWorkspace();
  } else if (action === 'clear-deployment-evidence') {
    state.deploymentEvidence = {};
    safeStorageRemove(DEPLOYMENT_EVIDENCE_KEY);
    renderWorkspace();
  } else if (action === 'export-json') exportJson();
  else if (action === 'export-intent') download(`${slugify(elements.projectName.value)}-privacy-intent.yaml`, state.report.privacyIntent.document, 'text/yaml');
  else if (action === 'export-passport') download(`${slugify(elements.projectName.value)}-privacy-passport.json`, JSON.stringify(state.report.privacyPassport, null, 2), 'application/json');
  else if (action === 'export-forge-zip') exportForgeZip();
  else if (action === 'export-markdown') exportMarkdown();
  else if (action === 'export-policy') exportPolicy();
  else if (action === 'export-ci-kit') exportCiKit();
  else if (action === 'export-lineage') download(`${slugify(elements.projectName.value)}-deployment-lineage.json`, JSON.stringify({ privacyTwin: state.report.privacyTwin, deploymentLineage: state.report.deploymentLineage, privacyPassport: state.report.privacyPassport, arcDeployRehearsal: state.report.arcDeployRehearsal }, null, 2), 'application/json');
  else if (action === 'export-zip') exportZip();
  else if (action === 'export-release-gate') download(`${slugify(elements.projectName.value)}-release-gate.json`, JSON.stringify(buildReleaseGateSnapshot(), null, 2), 'application/json');
  else if (action === 'verify-bytecode') await verifyArcBytecode();
  else if (action === 'clear-bytecode-artifact') {
    state.bytecodeTruth = { artifact: null, artifactFileName: '', verification: null, error: null };
    renderWorkspace();
  }
  else if (action === 'export-bytecode-attestation') download(`${slugify(elements.projectName.value)}-bytecode-truth.json`, JSON.stringify(state.bytecodeTruth.verification, null, 2), 'application/json');
  else if (action === 'download-proof-kit') exportProofLabKit();
  else if (action === 'export-proof-attestation') download(`${slugify(elements.projectName.value)}-proof-of-fix.json`, JSON.stringify(currentProofLabSnapshot(), null, 2), 'application/json');
  else if (action === 'copy-proof-command') {
    const proof = currentProofLabSnapshot();
    await navigator.clipboard.writeText(proof.commands[button.dataset.command] || proof.commands.foundry);
    setMessage(`${button.dataset.command === 'hardhat' ? 'Hardhat' : 'Foundry'} Proof Lab command copied.`, 'success');
  }
  else if (action === 'copy-release-command') {
    await navigator.clipboard.writeText(buildReleaseGateSnapshot().ciCommand);
    setMessage('Release Gate CI command copied.', 'success');
  }
  else if (action === 'clear-history') {
    state.history = [];
    writeHistory();
    renderWorkspace();
  } else if (action === 'history-baseline') {
    state.baseline = structuredClone(state.history[Number(button.dataset.index)].report);
    state.activeView = 'compare';
    renderAll();
  } else if (action === 'history-open') {
    const item = state.history[Number(button.dataset.index)];
    if (!item?.report) throw new Error('The selected history entry is unavailable.');
    const files = cloneSourceFiles(item.files);
    setFiles(files, { invalidateReport: false, announce: false });
    elements.projectName.value = item.label || 'Solidity project';
    state.report = structuredClone(item.report);
    if (item.report.privacyIntent?.declaration) state.intentDeclaration = structuredClone(item.report.privacyIntent.declaration);
    state.activeView = 'triage';
    state.filters = { query: '', severity: 'all', policy: 'all' };
    renderAll();
    setMessage(files.length
      ? `Historical scan opened with ${files.length} matching source file${files.length === 1 ? '' : 's'}.`
      : 'Historical report opened. Original source files are unavailable after a page reload, so source files will be omitted from ZIP exports.',
    files.length ? 'success' : 'normal');
  }
}

function bindEvents() {
  document.querySelectorAll('[data-demo]').forEach((button) => button.addEventListener('click', () => loadDemo(button.dataset.demo, { scan: true }).catch((error) => setMessage(error.message, 'error'))));
  elements.fileInput.addEventListener('change', () => loadFilesAndScan(elements.fileInput.files));
  elements.folderInput.addEventListener('change', () => loadFilesAndScan(elements.folderInput.files));
  elements.clearFiles.addEventListener('click', () => setFiles([]));
  elements.scanButton.addEventListener('click', runScan);
  document.querySelector('#heroDemo')?.addEventListener('click', () => { loadDemo('vulnerable', { scan: true }).catch((error) => setMessage(error.message, 'error')); document.querySelector('#scanner')?.scrollIntoView({ behavior: 'smooth' }); });
  document.querySelector('#heroUpload')?.addEventListener('click', () => elements.fileInput.click());

  ['dragenter', 'dragover'].forEach((name) => elements.dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add('dragging');
  }));
  ['dragleave', 'drop'].forEach((name) => elements.dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove('dragging');
  }));
  elements.dropZone.addEventListener('drop', (event) => loadFilesAndScan(event.dataTransfer.files));
  elements.dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') elements.fileInput.click();
  });

  elements.walletButton?.addEventListener('click', connectHeaderWallet);
  elements.walletMenuClose?.addEventListener('click', closeWalletMenu);
  elements.walletBackdrop?.addEventListener('click', closeWalletMenu);
  elements.walletDisconnect?.addEventListener('click', disconnectWalletUi);
  elements.walletPickerClose?.addEventListener('click', closeWalletPicker);
  elements.walletPickerBackdrop?.addEventListener('click', closeWalletPicker);
  elements.walletPickerList?.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-wallet-choice]');
    if (!choice) return;
    const candidate = walletPickerCandidates[Number(choice.dataset.walletChoice)];
    if (candidate) connectWithWalletCandidate(candidate, pendingWalletContext || {}).catch((error) => setMessage(normalizeWalletError(error), 'error'));
  });
  elements.walletCopyAddress?.addEventListener('click', async () => {
    if (!state.walletAccount) return;
    await navigator.clipboard.writeText(state.walletAccount);
    const previous = elements.walletCopyAddress.textContent;
    elements.walletCopyAddress.textContent = 'Copied';
    setTimeout(() => { elements.walletCopyAddress.textContent = previous; }, 1200);
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeWalletMenu(); closeWalletPicker(); } });

  document.querySelectorAll('.nav-button').forEach((button) => button.addEventListener('click', () => {
    state.activeView = button.dataset.view;
    renderAll();
  }));

  elements.workspace.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (button) handleWorkspaceAction(button).catch((error) => setMessage(error.message, 'error'));
  });
  elements.workspace.addEventListener('input', (event) => {
    if (event.target.id === 'finding-query') {
      state.filters.query = event.target.value;
      renderWorkspace();
      document.querySelector('#finding-query')?.focus();
    }
  });
  elements.workspace.addEventListener('change', (event) => {
    if (event.target.id === 'bytecode-artifact-input') loadBytecodeArtifact(event.target.files?.[0]).catch((error) => setMessage(error.message, 'error'));
    if (event.target.id === 'proof-lab-receipt-input') loadProofLabReceipt(event.target.files?.[0]).catch((error) => setMessage(error.message, 'error'));
    if (event.target.id === 'severity-filter') state.filters.severity = event.target.value;
    if (event.target.id === 'policy-filter') state.filters.policy = event.target.value;
    if (event.target.id === 'intent-public-observer') state.intentDeclaration.defaults.publicObserver = event.target.value;
    if (event.target.id === 'intent-external-contract') state.intentDeclaration.defaults.externalContract = event.target.value;
    if (event.target.id === 'intent-record-owner') state.intentDeclaration.defaults.recordOwner = event.target.value;
    if (event.target.id === 'intent-least-privilege') state.intentDeclaration.controls.requireLeastPrivilege = event.target.checked;
    if (event.target.id === 'intent-revocation') state.intentDeclaration.controls.requireRevocationPath = event.target.checked;
    if (event.target.id === 'intent-revert-data') state.intentDeclaration.controls.prohibitSensitiveRevertData = event.target.checked;
    if (event.target.id === 'intent-lineage') state.intentDeclaration.controls.requireDeploymentLineage = event.target.checked;
    if (event.target.id === 'attack-replay-select') {
      state.activeReplayId = event.target.value;
      renderWorkspace();
    }
    if (event.target.id === 'severity-filter' || event.target.id === 'policy-filter') renderWorkspace();
  });
}

async function init() {
  globalThis.addEventListener?.('eip6963:announceProvider', (event) => rememberWalletProvider(event?.detail));
  requestAnnouncedProviders();
  window.addEventListener('error', (event) => {
    document.body.dataset.runtimeError = event.message || 'unknown';
  });
  window.addEventListener('unhandledrejection', (event) => {
    document.body.dataset.runtimeError = event.reason?.message || String(event.reason || 'unhandled rejection');
  });
  bindEvents();
  await hydrateWallet();
  renderFileList();
  renderAll();
  try {
    await loadDemo('vulnerable');
    runScan();
  } catch (error) {
    console.error(error);
    setMessage(error instanceof Error ? error.message : String(error), 'error');
  }
  document.body.dataset.ready = 'true';
  window.__VEILFORGE_READY__ = true;
}

init();
