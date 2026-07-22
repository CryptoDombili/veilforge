import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';

const root = process.cwd();
const dist = path.join(root, 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist/index.html is missing. Run npm run build:web first.');

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function stripModuleSyntax(code) {
  return code
    .replace(/^\s*import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*$/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"];\s*$/gm, '')
    .replace(/\bexport\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/g, '')
    .replace(/^\s*export\s*\{[\s\S]*?\};?\s*$/gm, '');
}

const moduleOrder = [
  'engine/keccak.js',
  'engine/constants.js',
  'engine/canonical.js',
  'engine/parser.js',
  'engine/rules.js',
  'engine/policies.js',
  'engine/exposure.js',
  'engine/compare.js',
  'engine/report.js',
  'engine/format.js',
  'proof/registry.js',
  'lib/zip.js',
  'config.js',
  'app.js',
];

const demoFiles = [
  'examples/vulnerable-payroll/Payroll.sol',
  'examples/remediated-payroll/PayrollPrivateReady.sol',
  'examples/multi-contract/Payroll.sol',
  'examples/multi-contract/Settlement.sol',
];
const demoMap = Object.fromEntries(demoFiles.map((file) => [file, fs.readFileSync(path.join(dist, file), 'utf8')]));
const fetchShim = `
const __VEILFORGE_DEMOS__ = ${JSON.stringify(demoMap).replaceAll('</script', '<\\/script')};
globalThis.fetch = async (input) => {
  const raw = String(input);
  const key = raw.startsWith('./') ? raw.slice(2) : raw;
  if (Object.prototype.hasOwnProperty.call(__VEILFORGE_DEMOS__, key)) {
    return new Response(__VEILFORGE_DEMOS__[key], { status: 200, headers: { 'content-type': 'text/plain' } });
  }
  return new Response('Not found', { status: 404 });
};
`;
const bundle = [fetchShim, ...moduleOrder.map((file) => `\n// ---- ${file} ----\n${stripModuleSyntax(fs.readFileSync(path.join(dist, file), 'utf8'))}`)].join('\n');
const css = fs.readFileSync(path.join(dist, 'styles.css'), 'utf8');
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
  .replace(/<link[^>]+href="\.\/styles\.css"[^>]*>/, `<style>${css.replaceAll('</style', '<\/style')}</style>`)
  .replace(/<script\s+type="module"\s+src="\.\/app\.js"><\/script>/, '');
html = html.replace('</body>', `<script type="module">${bundle.replaceAll('</script', '<\\/script')}</script></body>`);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'veilforge-chromium-'));
const chromium = process.env.CHROMIUM_BIN || '/usr/lib/chromium/chromium';
const child = spawn(chromium, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--ozone-platform=headless', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
const chromiumErrors = 'Chromium stderr is suppressed by the deterministic smoke runner.';

async function waitForPort() {
  const file = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (fs.existsSync(file)) return Number(fs.readFileSync(file, 'utf8').split('\n')[0]);
    if (child.exitCode !== null) throw new Error(`Chromium exited before DevTools started.\n${chromiumErrors}`);
    await sleep(100);
  }
  throw new Error(`Chromium DevTools port was not created.\n${chromiumErrors}`);
}

function connectCdp(webSocketUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    const pending = new Map();
    const exceptions = [];
    let nextId = 1;
    socket.addEventListener('open', () => {
      resolve({
        exceptions,
        send(method, params = {}) {
          const id = nextId++;
          return new Promise((resolveCall, rejectCall) => {
            pending.set(id, { resolve: resolveCall, reject: rejectCall });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close() { socket.close(); },
      });
    });
    socket.addEventListener('error', () => reject(new Error('Could not connect to Chromium DevTools.')));
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') {
        exceptions.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception');
      }
      if (!message.id || !pending.has(message.id)) return;
      const call = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) call.reject(new Error(message.error.message));
      else call.resolve(message.result);
    });
  });
}

let cdp;
try {
  const port = await waitForPort();
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const target = targets.find((item) => item.type === 'page');
  if (!target?.webSocketDebuggerUrl) throw new Error('No Chromium page target was available.');
  cdp = await connectCdp(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const frameTree = await cdp.send('Page.getFrameTree');
  await cdp.send('Page.setDocumentContent', { frameId: frameTree.frameTree.frame.id, html });

  let snapshot;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await cdp.send('Runtime.evaluate', {
      expression: `({
        ready: document.body?.dataset.ready,
        reportHash: document.body?.dataset.reportHash,
        projectStatus: document.body?.dataset.projectStatus,
        runtimeError: document.body?.dataset.runtimeError || null,
        title: document.title,
        findings: document.querySelectorAll('.finding-card').length,
        summaryText: document.querySelector('#mission-summary')?.innerText?.slice(0, 180)
      })`,
      returnByValue: true,
    });
    snapshot = result.result?.value;
    if (snapshot?.ready === 'true') break;
    await sleep(100);
  }

  const uiFixResult = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const star = getComputedStyle(document.querySelector('.starfield-a'));
      const list = document.querySelector('.finding-list');
      globalThis.__walletMethodsKeplr = [];
      globalThis.__walletMethodsMetaMask = [];
      globalThis.__walletMethodsPhantom = [];
      globalThis.__walletMethodsRabby = [];
      globalThis.__walletMethodsRabbyLegacy = [];
      globalThis.__walletMethodsZerion = [];
      try { delete globalThis.ethereum; } catch { globalThis.ethereum = undefined; }
      try { delete globalThis.keplr; } catch { globalThis.keplr = undefined; }
      try { delete globalThis.phantom; } catch { globalThis.phantom = undefined; }
      let smokeChainId = '0x1';
      let smokeSwitchAttempts = 0;
      globalThis.__walletAddParams = null;
      const makeProvider = (methodLog, account, flags = {}) => {
        const handlers = {};
        return {
          ...flags,
          __handlers: handlers,
          request: async ({ method, params }) => {
            methodLog.push(method);
            if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
            if (method === 'eth_chainId') return smokeChainId;
            if (method === 'wallet_switchEthereumChain') {
              smokeSwitchAttempts += 1;
              if (smokeSwitchAttempts === 1) {
                const error = new Error('Unknown chain');
                error.data = { originalError: { code: 4902 } };
                throw error;
              }
              smokeChainId = params[0].chainId;
              return null;
            }
            if (method === 'wallet_addEthereumChain') {
              globalThis.__walletAddParams = params[0];
              return null;
            }
            return null;
          },
          on: (eventName, handler) => { handlers[eventName] = handler; }
        };
      };
      const keplrProvider = makeProvider(globalThis.__walletMethodsKeplr, '0x1111111111111111111111111111111111111111', { isKeplr: true });
      const metaMaskProvider = makeProvider(globalThis.__walletMethodsMetaMask, '0x2222222222222222222222222222222222222222', { isMetaMask: true });
      const phantomProvider = makeProvider(globalThis.__walletMethodsPhantom, '0x3333333333333333333333333333333333333333', { isPhantom: true });
      const rabbyProvider = makeProvider(globalThis.__walletMethodsRabby, '0x4444444444444444444444444444444444444444', { isRabby: true });
      const rabbyLegacyProvider = makeProvider(globalThis.__walletMethodsRabbyLegacy, '0x5555555555555555555555555555555555555555', { isRabby: true, isMetaMask: true });
      const zerionProvider = makeProvider(globalThis.__walletMethodsZerion, '0x6666666666666666666666666666666666666666', { isZerion: true });
      globalThis.ethereum = { providers: [rabbyLegacyProvider] };
      globalThis.keplr = { ethereum: keplrProvider };
      globalThis.phantom = { ethereum: phantomProvider };
      const announceProviders = () => {
        globalThis.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
          detail: { info: { rdns: 'app.keplr', name: 'Keplr', uuid: 'veilforge-keplr' }, provider: keplrProvider }
        }));
        globalThis.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
          detail: { info: { rdns: 'io.metamask', name: 'MetaMask', uuid: 'veilforge-metamask' }, provider: metaMaskProvider }
        }));
        globalThis.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
          detail: { info: { rdns: 'app.phantom', name: 'Phantom', uuid: 'veilforge-phantom' }, provider: phantomProvider }
        }));
        globalThis.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
          detail: { info: { rdns: 'io.rabby', name: 'Rabby Wallet', uuid: 'veilforge-rabby', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>' }, provider: rabbyProvider }
        }));
        globalThis.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
          detail: { info: { rdns: 'io.zerion.wallet', name: 'Zerion Wallet', uuid: 'veilforge-zerion' }, provider: zerionProvider }
        }));
      };
      globalThis.addEventListener('eip6963:requestProvider', announceProviders);
      document.querySelector('#header-wallet-button')?.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      const walletChoiceNames = [...document.querySelectorAll('.wallet-choice b')].map((node) => node.textContent);
      const walletPickerOpen = document.querySelector('#wallet-picker')?.classList.contains('open') || false;
      const zerionChoice = [...document.querySelectorAll('.wallet-choice')].find((node) => node.querySelector('b')?.textContent === 'Zerion');
      zerionChoice?.click();
      await new Promise((resolve) => setTimeout(resolve, 420));
      const connectedLabel = document.querySelector('#header-wallet-label')?.textContent;
      const walletMenuAutoOpen = document.querySelector('#wallet-menu')?.classList.contains('open') || false;
      const walletPickerClosedAfterSelection = !document.querySelector('#wallet-picker')?.classList.contains('open');
      document.querySelector('#header-wallet-button')?.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      const walletMenuOpenAfterAddressClick = document.querySelector('#wallet-menu')?.classList.contains('open') || false;
      const walletNetworkLabel = document.querySelector('#wallet-menu-network')?.textContent || '';
      const unusedWalletMethodsBeforeSwitch = [
        ...globalThis.__walletMethodsKeplr,
        ...globalThis.__walletMethodsMetaMask,
        ...globalThis.__walletMethodsPhantom,
        ...globalThis.__walletMethodsRabby,
        ...globalThis.__walletMethodsRabbyLegacy,
      ];

      document.querySelector('#wallet-disconnect')?.click();
      document.querySelector('#header-wallet-button')?.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      const metaMaskChoice = [...document.querySelectorAll('.wallet-choice')].find((node) => node.querySelector('b')?.textContent === 'MetaMask');
      metaMaskChoice?.click();
      await new Promise((resolve) => setTimeout(resolve, 220));
      zerionProvider.__handlers.accountsChanged?.(['0x7777777777777777777777777777777777777777']);
      await new Promise((resolve) => setTimeout(resolve, 30));
      const activeWalletAfterStaleEvent = document.querySelector('#header-wallet-label')?.textContent || '';
      document.querySelector('#header-wallet-button')?.click();
      await new Promise((resolve) => setTimeout(resolve, 60));
      const activeWalletNetworkAfterStaleEvent = document.querySelector('#wallet-menu-network')?.textContent || '';
      document.querySelector('#wallet-menu-close')?.click();

      return {
        starOpacity: Number(star.opacity),
        starZ: Number(star.zIndex),
        listClientHeight: list?.clientHeight || 0,
        listScrollHeight: list?.scrollHeight || 0,
        listOverflow: list ? getComputedStyle(list).overflowY : '',
        connectedLabel,
        walletPickerOpen,
        walletChoiceNames,
        walletPickerClosedAfterSelection,
        walletMenuAutoOpen,
        walletMenuOpenAfterAddressClick,
        walletNetworkLabel,
        walletMethods: globalThis.__walletMethodsZerion,
        unusedWalletMethods: unusedWalletMethodsBeforeSwitch,
        activeWalletAfterStaleEvent,
        activeWalletNetworkAfterStaleEvent,
        walletAddParams: globalThis.__walletAddParams,
        finalWalletChainId: smokeChainId,
        scanMessage: document.querySelector('#scan-message')?.textContent,
        heroPrimaryBackground: getComputedStyle(document.querySelector('#heroDemo')).backgroundImage,
        scanPrimaryBackground: getComputedStyle(document.querySelector('#scan-button')).backgroundImage,
        scanHasPrimaryClass: document.querySelector('#scan-button')?.classList.contains('primary') || false,
        runtimeErrorNow: document.body.dataset.runtimeError || null
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const uiFixes = uiFixResult.result?.value;

  const failures = [];
  if (snapshot?.ready !== 'true') failures.push('runtime ready marker');
  if (!/^0x[0-9a-f]{64}$/.test(snapshot?.reportHash ?? '')) failures.push('canonical report hash');
  if (snapshot?.projectStatus !== 'Deployment Blocked') failures.push('project status');
  if (!String(snapshot?.title).includes('Privacy Mission Control')) failures.push('document title');
  if ((snapshot?.findings ?? 0) < 1) failures.push('rendered findings');
  if (snapshot?.runtimeError) failures.push(`runtime error: ${snapshot.runtimeError}`);
  if ((uiFixes?.starOpacity ?? 0) < 0.5 || (uiFixes?.starZ ?? -1) < 0) failures.push('visible starfield layer');
  if (uiFixes?.listOverflow !== 'auto' || (uiFixes?.listClientHeight ?? 0) > 630 || (uiFixes?.listScrollHeight ?? 0) <= (uiFixes?.listClientHeight ?? 0)) failures.push(`bounded findings scroll area (${uiFixes?.listOverflow}, ${uiFixes?.listClientHeight}/${uiFixes?.listScrollHeight})`);
  const expectedWalletNames = ['Keplr EVM', 'MetaMask', 'Phantom', 'Rabby Wallet', 'Zerion'];
  if (!uiFixes?.walletPickerOpen || JSON.stringify(uiFixes?.walletChoiceNames) !== JSON.stringify(expectedWalletNames)) failures.push(`canonical wallet chooser (${JSON.stringify(uiFixes?.walletChoiceNames)})`);
  if ((uiFixes?.walletChoiceNames || []).filter((name) => name.includes('Rabby')).length !== 1) failures.push(`duplicate Rabby entry (${JSON.stringify(uiFixes?.walletChoiceNames)})`);
  if (!String(uiFixes?.connectedLabel).includes('0x6666') || !uiFixes?.walletPickerClosedAfterSelection) failures.push('selected Zerion connection');
  if (uiFixes?.walletMenuAutoOpen) failures.push('wallet session must not auto-open after connection');
  if (!uiFixes?.walletMenuOpenAfterAddressClick) failures.push('wallet session opens from connected address button');
  if (!String(uiFixes?.walletNetworkLabel).includes('Zerion')) failures.push(`selected wallet identity in session (${uiFixes?.walletNetworkLabel})`);
  if ((uiFixes?.unusedWalletMethods?.length ?? 0) !== 0) failures.push(`unselected wallet was called (${JSON.stringify(uiFixes?.unusedWalletMethods)})`);
  if (!String(uiFixes?.activeWalletAfterStaleEvent).includes('0x2222') || !String(uiFixes?.activeWalletNetworkAfterStaleEvent).includes('MetaMask')) failures.push(`stale wallet provider event isolation (${uiFixes?.activeWalletAfterStaleEvent}, ${uiFixes?.activeWalletNetworkAfterStaleEvent})`);
  if (uiFixes?.walletMethods?.[0] !== 'eth_requestAccounts' || uiFixes?.walletMethods?.[1] !== 'eth_chainId') failures.push(`selected wallet request order (${JSON.stringify(uiFixes?.walletMethods)})`);
  if (uiFixes?.walletAddParams?.chainId?.toLowerCase() !== '0x4cef52' || uiFixes?.walletAddParams?.nativeCurrency?.decimals !== 18) failures.push(`Arc network add parameters (${JSON.stringify(uiFixes?.walletAddParams)})`);
  if (String(uiFixes?.finalWalletChainId).toLowerCase() !== '0x4cef52') failures.push(`Arc network selection (${uiFixes?.finalWalletChainId})`);
  if (!uiFixes?.scanHasPrimaryClass || uiFixes?.heroPrimaryBackground !== uiFixes?.scanPrimaryBackground) failures.push('exact primary gradient parity');
  if (String(uiFixes?.scanMessage).includes('[object Object]')) failures.push('object object scan message');
  if (cdp.exceptions.length) failures.push(`browser exceptions: ${cdp.exceptions.join('; ')}`);

  const screenshotPath = process.env.VEILFORGE_SMOKE_SCREENSHOT;
  if (screenshotPath) {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.resolve(screenshotPath), Buffer.from(shot.data, 'base64'));
  }

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(150);
  const mobileResult = await cdp.send('Runtime.evaluate', {
    expression: `({
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      topbarVisible: Boolean(document.querySelector('.topbar')),
      uploadVisible: Boolean(document.querySelector('#file-input')),
      missionVisible: Boolean(document.querySelector('#mission-summary'))
    })`,
    returnByValue: true,
  });
  const mobile = mobileResult.result?.value;
  if (!mobile?.topbarVisible || !mobile?.uploadVisible || !mobile?.missionVisible) failures.push('mobile critical controls');
  if ((mobile?.scrollWidth ?? Infinity) > (mobile?.viewport ?? 0) + 2) failures.push(`mobile horizontal overflow (${mobile?.scrollWidth}px > ${mobile?.viewport}px)`);

  const mobileScreenshotPath = process.env.VEILFORGE_MOBILE_SCREENSHOT;
  if (mobileScreenshotPath) {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.resolve(mobileScreenshotPath), Buffer.from(shot.data, 'base64'));
  }

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const interactionResult = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const openView = (name) => document.querySelector('[data-view="' + name + '"]')?.click();
      openView('chains');
      const chains = document.querySelectorAll('.chain-card').length;
      openView('treatment');
      const treatments = document.querySelectorAll('.task-card').length;
      openView('proof');
      const proofCards = document.querySelectorAll('.proof-card').length;
      const registry = document.querySelector('#registry-address')?.value;
      openView('history');
      const historyCards = document.querySelectorAll('.history-card').length;

      globalThis.__veilforgeDownloads = [];
      URL.createObjectURL = (blob) => {
        globalThis.__veilforgeLastBlob = blob;
        return 'blob:veilforge-smoke';
      };
      URL.revokeObjectURL = () => {};
      HTMLAnchorElement.prototype.click = function click() {
        globalThis.__veilforgeDownloads.push(this.download);
      };
      openView('exports');
      const exportCards = document.querySelectorAll('.export-card').length;
      for (const action of ['export-json', 'export-markdown', 'export-policy', 'export-zip']) {
        document.querySelector('[data-action="' + action + '"]')?.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 20));

      openView('compare');
      document.querySelector('[data-action="compare-hardened"]')?.click();
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (document.body.dataset.projectStatus === 'Ready' && document.querySelectorAll('.compare-card').length === 4) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const comparedStatus = document.body.dataset.projectStatus;
      const compareCards = document.querySelectorAll('.compare-card').length;
      const resolvedText = document.querySelector('.compare-card:nth-child(2) strong')?.textContent;

      openView('history');
      const historyOpenButtons = [...document.querySelectorAll('[data-action="history-open"]')];
      historyOpenButtons.at(-1)?.click();
      await new Promise((resolve) => setTimeout(resolve, 40));
      const restoredHistoryFile = document.querySelector('#file-list')?.textContent || '';
      const restoredHistoryLabel = document.querySelector('#project-name')?.value || '';
      const restoredHistoryView = document.querySelector('[data-view="triage"]')?.classList.contains('active') || false;

      const replacement = new DataTransfer();
      replacement.items.add(new File(['// SPDX-License-Identifier: MIT\\npragma solidity ^0.8.24; contract Fresh {}'], 'Fresh.sol', { type: 'text/plain' }));
      const fileInput = document.querySelector('#file-input');
      fileInput.files = replacement.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      const reportInvalidatedAfterFileChange = !document.body.dataset.reportHash
        && document.querySelector('#mission-summary')?.textContent.includes('Mission awaiting scan')
        && document.querySelector('#file-list')?.textContent.includes('Fresh.sol');

      return {
        chains,
        treatments,
        proofCards,
        registry,
        historyCards,
        exportCards,
        downloads: globalThis.__veilforgeDownloads,
        comparedStatus,
        compareCards,
        resolvedText,
        restoredHistoryFile,
        restoredHistoryLabel,
        restoredHistoryView,
        reportInvalidatedAfterFileChange,
        runtimeError: document.body.dataset.runtimeError || null
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const interactions = interactionResult.result?.value;
  if ((interactions?.chains ?? 0) < 1) failures.push('exposure chain view');
  if ((interactions?.treatments ?? 0) < 1) failures.push('treatment plan view');
  if (interactions?.proofCards !== 2 || interactions?.registry !== '0xf8b1D03931f2c11B642259d9aB19cfA3351C0Bbc') failures.push('proof center view');
  if ((interactions?.historyCards ?? 0) < 1) failures.push('local history view');
  if (interactions?.exportCards !== 4 || interactions?.downloads?.length !== 4) failures.push('export actions');
  if (interactions?.comparedStatus !== 'Ready' || interactions?.compareCards !== 4 || Number(interactions?.resolvedText) < 1) failures.push('scan comparison flow');
  if (!String(interactions?.restoredHistoryFile).includes('Payroll.sol') || interactions?.restoredHistoryLabel !== 'Arc Payroll Mission' || !interactions?.restoredHistoryView) failures.push(`history source restoration (${interactions?.restoredHistoryLabel}, ${interactions?.restoredHistoryFile})`);
  if (!interactions?.reportInvalidatedAfterFileChange) failures.push('file replacement invalidates stale report');
  if (interactions?.runtimeError) failures.push(`interaction runtime error: ${interactions.runtimeError}`);
  if (cdp.exceptions.length) failures.push(`browser exceptions after interactions: ${cdp.exceptions.join('; ')}`);

  if (failures.length) throw new Error(`Browser smoke failed: ${failures.join(', ')}\nSnapshot: ${JSON.stringify(snapshot)}`);
  console.log(`Chromium CDP runtime smoke passed: ${snapshot.reportHash} · ${snapshot.projectStatus} · ${snapshot.findings} rendered findings · 390px responsive check.`);
} finally {
  cdp?.close();
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(2000)]);
  }
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });
  } catch (error) {
    if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error?.code)) throw error;
    console.warn(`Chromium profile cleanup deferred: ${error.code}`);
  }
}

process.exit(0);
