import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';

const root = process.cwd();
const dist = path.join(root, 'dist');
if (!fs.existsSync(path.join(dist, 'app', 'index.html'))) throw new Error('dist/app/index.html is missing. Run npm run build:web first.');

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
  'engine/genome.js',
  'engine/intent.js',
  'engine/attack.js',
  'engine/forge.js',
  'engine/twin.js',
  'engine/deployment.js',
  'engine/gate.js',
  'engine/fuzz.js',
  'engine/passport.js',
  'engine/compare.js',
  'engine/report.js',
  'engine/format.js',
  'proof/registry.js',
  'lib/zip.js',
  'lib/unzip.js',
  'lib/project-xray.js',
  'lib/bytecode-truth.js',
  'lib/proof-lab.js',
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
let html = fs.readFileSync(path.join(dist, 'app', 'index.html'), 'utf8')
  .replace(/<link[^>]+href="\.\/styles\.css(?:\?[^\"]*)?"[^>]*>/, `<style>${css.replaceAll('</style', '<\/style')}</style>`)
  .replace(/<script\s+type="module"\s+src="\.\/app\.js(?:\?[^\"]*)?"><\/script>/, '');
html = html.replace('</body>', `<script type="module">${bundle.replaceAll('</script', '<\\/script')}</script></body>`);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'veilforge-chromium-'));
function findChromium() {
  const candidates = [
    process.env.CHROMIUM_BIN,
    process.platform === 'win32' && process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.platform === 'win32' && process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.platform === 'win32' && process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.platform === 'win32' && process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.platform === 'win32' && process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.platform === 'darwin' && '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    process.platform === 'darwin' && '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/lib/chromium/chromium',
  ].filter(Boolean);
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  if (!executable) {
    throw new Error('Chrome, Edge, or Chromium was not found. Set CHROMIUM_BIN to the browser executable path.');
  }
  return executable;
}

const chromium = findChromium();
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
      const workspaceScroller = document.querySelector('.workspace');
      const missionNav = document.querySelector('.mission-nav');
      const missionNavRows = new Set([...missionNav.querySelectorAll('.nav-button')].map((button) => Math.round(button.getBoundingClientRect().top))).size;
      const missionNavLabels = [...missionNav.querySelectorAll('.nav-button')].map((button) => button.textContent.trim());
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
        workspaceOverflow: workspaceScroller ? getComputedStyle(workspaceScroller).overflowY : '',
        workspaceClientHeight: workspaceScroller?.clientHeight || 0,
        workspaceScrollHeight: workspaceScroller?.scrollHeight || 0,
        missionNavRows,
        missionNavLabels,
        missionNavOverflowX: getComputedStyle(missionNav).overflowX,
        missionNavClientWidth: missionNav.clientWidth,
        missionNavScrollWidth: missionNav.scrollWidth,
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
  if (!String(snapshot?.title).includes('Privacy Deployment OS')) failures.push('document title');
  if ((snapshot?.findings ?? 0) < 1) failures.push('rendered findings');
  if (snapshot?.runtimeError) failures.push(`runtime error: ${snapshot.runtimeError}`);
  if ((uiFixes?.starOpacity ?? 0) < 0.5 || (uiFixes?.starZ ?? -1) < 0) failures.push('visible starfield layer');
  if (uiFixes?.listOverflow !== 'visible' || uiFixes?.workspaceOverflow !== 'auto' || (uiFixes?.workspaceScrollHeight ?? 0) <= (uiFixes?.workspaceClientHeight ?? 0)) failures.push(`single natural results scroller (${uiFixes?.listOverflow}/${uiFixes?.workspaceOverflow}, ${uiFixes?.workspaceClientHeight}/${uiFixes?.workspaceScrollHeight})`);
  if (uiFixes?.missionNavRows !== 2 || (uiFixes?.missionNavScrollWidth ?? Infinity) > (uiFixes?.missionNavClientWidth ?? 0) + 2 || ['auto', 'scroll'].includes(uiFixes?.missionNavOverflowX)) failures.push(`two-row mission navigation (${uiFixes?.missionNavRows} rows, ${uiFixes?.missionNavOverflowX}, ${uiFixes?.missionNavClientWidth}/${uiFixes?.missionNavScrollWidth})`);
  const expectedMissionFlow = ['Command','Genome','Intent','Shadow Lab','MRI','Twin','Treatment','Forge','Compare','Proof Lab','Bytecode Truth','Passport','Arc Proof','Release Gate','Exports','History'];
  if (JSON.stringify(uiFixes?.missionNavLabels) !== JSON.stringify(expectedMissionFlow)) failures.push(`ordered mission flow (${JSON.stringify(uiFixes?.missionNavLabels)})`);
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

  const workspaceScreenshotPath = process.env.VEILFORGE_WORKSPACE_SCREENSHOT;
  if (workspaceScreenshotPath) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Runtime.evaluate', { expression: `document.querySelector('#wallet-menu-close')?.click(); document.querySelector('[data-view=\"genome\"]')?.click(); document.querySelector('#scanner')?.scrollIntoView({ block: 'start' });` });
    await sleep(250);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.resolve(workspaceScreenshotPath), Buffer.from(shot.data, 'base64'));
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  }

  const mobileScreenshotPath = process.env.VEILFORGE_MOBILE_SCREENSHOT;
  if (mobileScreenshotPath) {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.resolve(mobileScreenshotPath), Buffer.from(shot.data, 'base64'));
  }

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const interactionResult = await cdp.send('Runtime.evaluate', {
    expression: `(async () => {
      const openView = (name) => document.querySelector('[data-view="' + name + '"]')?.click();
      const bounded = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return { selector, present: false };
        const style = getComputedStyle(element);
        return { selector, present: true, overflowY: style.overflowY, maxHeight: style.maxHeight, gutter: style.scrollbarGutter };
      };
      const boundedRegions = [];
      openView('triage');
      boundedRegions.push(bounded('.contract-grid'));
      openView('genome');
      const genomeAssets = document.querySelectorAll('.genome-asset').length;
      const genomeMatrix = document.querySelectorAll('.disclosure-matrix tbody tr').length;
      boundedRegions.push(bounded('.genome-assets'), bounded('.genome-graph'), bounded('.matrix-scroll'));
      openView('intent');
      const intentDocument = document.querySelector('.intent-document pre')?.textContent || '';
      const intentStudio = document.querySelectorAll('[data-testid="intent-studio"]').length;
      const intentPolicyControls = document.querySelectorAll('#intent-public-observer, #intent-external-contract, #intent-record-owner, .intent-control-list input').length;
      boundedRegions.push(bounded('.intent-violations'));
      openView('shadow');
      const attackCards = document.querySelectorAll('.attack-card').length;
      const replayFrames = document.querySelectorAll('.cinema-frame').length;
      document.querySelector('[data-action="play-attack-replay"]')?.click();
      boundedRegions.push(bounded('.attack-list'));
      openView('mri');
      const mriCards = document.querySelectorAll('.mri-card').length;
      boundedRegions.push(bounded('.mri-list'));
      openView('forge');
      const forgeCards = document.querySelectorAll('.forge-card').length;
      boundedRegions.push(bounded('.forge-list'));
      openView('passport');
      const passportId = document.querySelector('.passport-top code')?.textContent || '';
      const lineageStages = document.querySelectorAll('.lineage-stage').length;
      boundedRegions.push(bounded('.passport-card ul'));
      openView('chains');
      const chains = document.querySelectorAll('.chain-card').length;
      const twinSurfaces = document.querySelectorAll('.twin-surface').length;
      const twinRoadmap = document.querySelector('.twin-roadmap')?.textContent || '';
      boundedRegions.push(bounded('.twin-surface-list'), bounded('.twin-trust ul'), bounded('.chain-list'));
      openView('treatment');
      const treatments = document.querySelectorAll('.task-card').length;
      boundedRegions.push(bounded('.task-list'));
      openView('proof');
      const proofCards = document.querySelectorAll('.proof-card').length;
      const rehearsalChecks = document.querySelectorAll('.rehearsal-check').length;
      const registry = document.querySelector('#registry-address')?.value;
      boundedRegions.push(bounded('.rehearsal-checks'));
      openView('history');
      const historyCards = document.querySelectorAll('.history-card').length;
      boundedRegions.push(bounded('.history-list'));
      openView('release');
      const releaseChecks = document.querySelectorAll('.release-check').length;
      const releaseDecision = document.querySelector('.release-hero>div:first-child>strong')?.textContent || '';
      const releaseStages = document.querySelectorAll('.release-stage').length;
      boundedRegions.push(bounded('.release-checks'), bounded('.release-actions'));

      openView('bytecode');
      const bytecodeArtifactTransfer = new DataTransfer();
      bytecodeArtifactTransfer.items.add(new File([JSON.stringify({ contractName: 'Payroll', sourceName: 'contracts/Payroll.sol', deployedBytecode: '0x6001600055' })], 'Payroll.json', { type: 'application/json' }));
      const bytecodeArtifactInput = document.querySelector('#bytecode-artifact-input');
      bytecodeArtifactInput.files = bytecodeArtifactTransfer.files;
      bytecodeArtifactInput.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      document.querySelector('#bytecode-target-address').value = '0x1111111111111111111111111111111111111111';
      const originalFetch = globalThis.fetch;
      const bytecodeRpcMethods = [];
      globalThis.fetch = async (_url, options) => {
        const request = JSON.parse(options.body);
        bytecodeRpcMethods.push(request.method);
        const result = request.method === 'eth_chainId' ? '0x4CEF52' : request.method === 'eth_getCode' ? '0x6001600055' : '0x' + '0'.repeat(64);
        return { ok: true, json: async () => ({ jsonrpc: '2.0', id: request.id, result }) };
      };
      document.querySelector('[data-action="verify-bytecode"]')?.click();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (document.querySelector('.bytecode-hero>div:first-child>strong')?.textContent === 'ARC VERIFIED') break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      globalThis.fetch = originalFetch;
      const bytecodeStatus = document.querySelector('.bytecode-hero>div:first-child>strong')?.textContent || '';
      const bytecodeArtifactName = document.querySelector('.artifact-card header strong')?.textContent || '';
      const bytecodeHashes = document.querySelectorAll('.truth-hash-row').length;
      const bytecodeRejectMethods = [];
      globalThis.fetch = async (_url, options) => {
        const request = JSON.parse(options.body);
        bytecodeRejectMethods.push(request.method);
        return { ok: true, json: async () => ({ jsonrpc: '2.0', id: request.id, result: request.method === 'eth_chainId' ? '0x1' : '0x6001600055' }) };
      };
      document.querySelector('[data-action="verify-bytecode"]')?.click();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (document.querySelector('.bytecode-error')?.textContent.includes('RPC network mismatch')) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      globalThis.fetch = originalFetch;
      const bytecodeRejectedStatus = document.querySelector('.bytecode-hero>div:first-child>strong')?.textContent || '';
      const bytecodeRejectError = document.querySelector('.bytecode-error')?.textContent || '';

      openView('prooftest');
      const proofReceiptTransfer = new DataTransfer();
      proofReceiptTransfer.items.add(new File([JSON.stringify({ framework: 'Foundry', compilation: { success: true }, tests: { total: 42, passed: 42, failed: 0 }, fuzz: { runs: 10000, failures: 0 } })], 'veilforge-proof-results.json', { type: 'application/json' }));
      const proofReceiptInput = document.querySelector('#proof-lab-receipt-input');
      proofReceiptInput.files = proofReceiptTransfer.files;
      proofReceiptInput.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 35));
      const proofLabDecision = document.querySelector('.proof-lab-hero>div:first-child>strong')?.textContent || '';
      const proofLabChecks = document.querySelectorAll('.proof-lab-check').length;
      const proofLabReceipt = document.querySelector('.proof-lab-console header strong')?.textContent || '';
      boundedRegions.push(bounded('.proof-lab-checks'));

      globalThis.__veilforgeDownloads = [];
      URL.createObjectURL = (blob) => {
        globalThis.__veilforgeLastBlob = blob;
        return 'blob:veilforge-smoke';
      };
      URL.revokeObjectURL = () => {};
      HTMLAnchorElement.prototype.click = function click() {
        globalThis.__veilforgeDownloads.push(this.download);
      };
      openView('prooftest');
      document.querySelector('[data-action="download-proof-kit"]')?.click();
      document.querySelector('[data-action="export-proof-attestation"]')?.click();
      openView('intent');
      document.querySelector('[data-action="export-intent"]')?.click();
      openView('forge');
      document.querySelector('[data-action="export-forge-zip"]')?.click();
      openView('passport');
      document.querySelector('[data-action="export-passport"]')?.click();
      openView('exports');
      const exportCards = document.querySelectorAll('.export-card').length;
      const gateChecks = document.querySelectorAll('.gate-check').length;
      const rulePacks = document.querySelectorAll('.rule-pack').length;
      const fuzzVectors = document.querySelector('.fuzz-panel strong')?.textContent || '';
      boundedRegions.push(bounded('.gate-check-grid'), bounded('.rule-pack-list'), bounded('.export-grid'));
      for (const action of ['export-json', 'export-markdown', 'export-policy', 'export-ci-kit', 'export-lineage', 'export-zip']) {
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
      boundedRegions.push(bounded('.mini-finding-list'));

      openView('history');
      const historyOpenButtons = [...document.querySelectorAll('[data-action="history-open"]')];
      historyOpenButtons.at(-1)?.click();
      await new Promise((resolve) => setTimeout(resolve, 40));
      const restoredHistoryFile = document.querySelector('#file-list')?.textContent || '';
      const restoredHistoryLabel = document.querySelector('#project-name')?.value || '';
      const restoredHistoryView = document.querySelector('[data-view="triage"]')?.classList.contains('active') || false;

      const reportHashBeforeFileChange = document.body.dataset.reportHash || '';
      const replacement = new DataTransfer();
      replacement.items.add(new File(['// SPDX-License-Identifier: MIT\\npragma solidity ^0.8.24; contract Fresh {}'], 'Fresh.sol', { type: 'text/plain' }));
      const fileInput = document.querySelector('#file-input');
      fileInput.files = replacement.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 120));
      const reportUpdatedAfterFileChange = Boolean(document.body.dataset.reportHash)
        && document.body.dataset.reportHash !== reportHashBeforeFileChange
        && !document.querySelector('#mission-summary')?.textContent.includes('Mission awaiting scan')
        && document.querySelector('#file-list')?.textContent.includes('Fresh.sol')
        && document.querySelectorAll('.severity-dot').length === 0;

      return {
        genomeAssets,
        genomeMatrix,
        intentDocument,
        intentStudio,
        intentPolicyControls,
        attackCards,
        replayFrames,
        mriCards,
        forgeCards,
        passportId,
        lineageStages,
        chains,
        twinSurfaces,
        twinRoadmap,
        treatments,
        proofCards,
        rehearsalChecks,
        registry,
        historyCards,
        releaseChecks,
        releaseDecision,
        releaseStages,
        bytecodeStatus,
        bytecodeArtifactName,
        bytecodeHashes,
        bytecodeRpcMethods,
        bytecodeRejectedStatus,
        bytecodeRejectMethods,
        bytecodeRejectError,
        proofLabDecision,
        proofLabChecks,
        proofLabReceipt,
        exportCards,
        gateChecks,
        rulePacks,
        fuzzVectors,
        downloads: globalThis.__veilforgeDownloads,
        comparedStatus,
        compareCards,
        resolvedText,
        restoredHistoryFile,
        restoredHistoryLabel,
        restoredHistoryView,
        reportUpdatedAfterFileChange,
        boundedRegions,
        runtimeError: document.body.dataset.runtimeError || null
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const interactions = interactionResult.result?.value;
  if ((interactions?.genomeAssets ?? 0) < 1 || (interactions?.genomeMatrix ?? 0) < 1) failures.push('privacy genome view');
  if (!String(interactions?.intentDocument).includes('require_deployment_lineage: true')) failures.push('privacy intent view');
  if (interactions?.intentStudio !== 1 || interactions?.intentPolicyControls !== 7) failures.push(`no-code privacy intent studio (${interactions?.intentStudio}/${interactions?.intentPolicyControls})`);
  if ((interactions?.attackCards ?? 0) < 1) failures.push('shadow evidence lab view');
  if ((interactions?.replayFrames ?? 0) < 2) failures.push('attack replay cinema');
  if ((interactions?.mriCards ?? 0) < 1) failures.push('transaction MRI view');
  if ((interactions?.forgeCards ?? 0) < 1) failures.push('forge mode view');
  if (!/^0x[0-9a-f]{64}$/.test(String(interactions?.passportId))) failures.push('privacy passport view');
  if (interactions?.lineageStages !== 6) failures.push(`living deployment lineage (${interactions?.lineageStages})`);
  if ((interactions?.chains ?? 0) < 1) failures.push('exposure chain view');
  if ((interactions?.twinSurfaces ?? 0) < 1 || !String(interactions?.twinRoadmap).includes('not a live APS deployment')) failures.push('privacy deployment twin view');
  if ((interactions?.treatments ?? 0) < 1) failures.push('treatment plan view');
  if (interactions?.proofCards !== 2 || interactions?.rehearsalChecks !== 6 || interactions?.registry !== '0x88B4055eaB061CEa9BdfefF524f65ff461B5401d') failures.push('proof center and deployment rehearsal view');
  if ((interactions?.historyCards ?? 0) < 1) failures.push('local history view');
  if ((interactions?.releaseChecks ?? 0) < 8 || interactions?.releaseDecision !== 'BLOCKED' || interactions?.releaseStages !== 4) failures.push(`release gate view (${interactions?.releaseChecks}/${interactions?.releaseDecision}/${interactions?.releaseStages})`);
  if (interactions?.bytecodeStatus !== 'ARC VERIFIED' || interactions?.bytecodeArtifactName !== 'Payroll.json' || interactions?.bytecodeHashes !== 2) failures.push(`bytecode truth view (${interactions?.bytecodeStatus}/${interactions?.bytecodeArtifactName}/${interactions?.bytecodeHashes})`);
  if (interactions?.bytecodeRpcMethods?.[0] !== 'eth_chainId' || !interactions?.bytecodeRpcMethods?.includes('eth_getCode')) failures.push(`Bytecode Truth RPC order (${JSON.stringify(interactions?.bytecodeRpcMethods)})`);
  if (interactions?.bytecodeRejectedStatus !== 'UNVERIFIED' || JSON.stringify(interactions?.bytecodeRejectMethods) !== JSON.stringify(['eth_chainId']) || !String(interactions?.bytecodeRejectError).includes('RPC network mismatch')) failures.push(`Bytecode Truth non-Arc rejection (${interactions?.bytecodeRejectedStatus}/${JSON.stringify(interactions?.bytecodeRejectMethods)}/${interactions?.bytecodeRejectError})`);
  if (interactions?.proofLabDecision !== 'BLOCKED' || interactions?.proofLabChecks !== 10 || interactions?.proofLabReceipt !== 'veilforge-proof-results.json') failures.push(`proof lab view (${interactions?.proofLabDecision}/${interactions?.proofLabChecks}/${interactions?.proofLabReceipt})`);
  if (interactions?.gateChecks !== 6 || (interactions?.rulePacks ?? 0) < 2 || Number(interactions?.fuzzVectors) < 1) failures.push('privacy gate, rule packs, and fuzz plan views');
  if (interactions?.exportCards !== 6 || interactions?.downloads?.length !== 11) failures.push(`export actions (${JSON.stringify(interactions?.downloads)})`);
  if (!interactions?.downloads?.some((name) => name.endsWith('-veilforge-ci-gate.zip')) || !interactions?.downloads?.some((name) => name.endsWith('-deployment-lineage.json'))) failures.push('Ascension export filenames');
  if (!interactions?.downloads?.some((name) => name.endsWith('-privacy-intent.yaml')) || !interactions?.downloads?.some((name) => name.endsWith('-veilforge-forge-candidates.zip')) || !interactions?.downloads?.some((name) => name.endsWith('-privacy-passport.json'))) failures.push('v3.2 export filenames');
  if (!interactions?.downloads?.some((name) => name.endsWith('-veilforge-proof-lab.zip')) || !interactions?.downloads?.some((name) => name.endsWith('-proof-of-fix.json'))) failures.push('Proof Lab export filenames');
  if (interactions?.comparedStatus !== 'Ready' || interactions?.compareCards !== 4 || Number(interactions?.resolvedText) < 1) failures.push('scan comparison flow');
  if (!String(interactions?.restoredHistoryFile).includes('Payroll.sol') || interactions?.restoredHistoryLabel !== 'Arc Payroll Mission' || !interactions?.restoredHistoryView) failures.push(`history source restoration (${interactions?.restoredHistoryLabel}, ${interactions?.restoredHistoryFile})`);
  if (!interactions?.reportUpdatedAfterFileChange) failures.push('file replacement automatically refreshes the report and radar');
  const unboundedRegions = (interactions?.boundedRegions || []).filter((region) => !region.present || !['auto', 'scroll'].includes(region.overflowY) || region.maxHeight === 'none');
  if (unboundedRegions.length || (interactions?.boundedRegions?.length ?? 0) < 19) failures.push(`bounded long-content regions (${JSON.stringify(unboundedRegions)})`);
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
