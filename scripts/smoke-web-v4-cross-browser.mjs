import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium, firefox, webkit } from 'playwright';
import { startStaticServer } from './lib/web-acceptance-browser.mjs';

const options = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, ...value] = item.replace(/^--/u, '').split('=');
  return [key, value.join('=')];
}));
const requestedBrowser = options.browser;
const summaryPath = options.summary;
if (!['chromium', 'firefox', 'webkit', 'edge'].includes(requestedBrowser)) throw new Error('Use --browser=chromium|firefox|webkit|edge.');
if (!summaryPath) throw new Error('Use --summary=<safe-json-path>.');

const root = process.cwd();
const preview = path.join(root, 'dist-preview-v4');
const fixtureRoot = path.join(root, 'tests', 'corpus', 'arc-payments', 'positive', 'PAY-POS-001');
const source = fs.readFileSync(path.join(fixtureRoot, 'project', 'src', 'Case.sol'), 'utf8');
const policy = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'policy.json'), 'utf8'));
const stageLimits = Object.freeze({ launch: 15_000, context: 5_000, page: 5_000, navigation: 15_000, app: 15_000, scan: 30_000, cleanup: 3_000, shutdown: 5_000 });
const result = { browser: requestedBrowser, passed: false, version: null, stages: [], repeatedScans: 0, orphanWorkers: null, pendingRequests: null, responsive390: false, cleanShutdown: false, errorCode: null };
let currentStage = 'BROWSER_LAUNCH';
let browser;
let context;
let page;
let server;
let activeWorkers = new Set();

function record(stage, startedAt, status = 'passed') {
  result.stages.push({ stage, status, durationMs: Math.round((performance.now() - startedAt) * 10) / 10 });
}

async function bounded(stage, limit, action) {
  currentStage = stage;
  const startedAt = performance.now();
  let timer;
  try {
    const value = await Promise.race([
      action(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('bounded stage timeout'), { code: `${stage}_TIMEOUT` })), limit); }),
    ]);
    record(stage, startedAt);
    return value;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForScan() {
  await page.waitForFunction(() => !document.querySelector('#v4-scan')?.disabled, null, { timeout: stageLimits.scan });
  return page.evaluate(() => ({
    status: document.querySelector('#v4-status strong')?.textContent ?? '',
    statusText: document.querySelector('#v4-status')?.textContent ?? '',
    findings: document.querySelectorAll('.v4-finding').length,
    activeRequest: document.querySelector('#v4-scan')?.disabled ? 1 : 0,
  }));
}

async function loadProject(projectId, content = source) {
  await page.locator('#v4-file-input').setInputFiles({ name: 'Case.sol', mimeType: 'text/plain', buffer: Buffer.from(content) });
  await page.evaluate(({ id, fixturePolicy }) => {
    document.querySelector('#v4-project-name').value = id;
    document.querySelectorAll('[name="v4-domain"]').forEach((node) => { node.checked = node.value === 'arc-payments'; });
    const mode = document.querySelector('#v4-policy-mode');
    mode.value = 'custom';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#v4-policy').value = JSON.stringify(fixturePolicy);
  }, { id: projectId, fixturePolicy: policy });
}

async function scan(projectId, content = source) {
  await loadProject(projectId, content);
  await page.locator('#v4-scan').click();
  return waitForScan();
}

async function waitForWorkerCleanup() {
  await page.waitForFunction(() => !document.querySelector('#v4-scan')?.disabled, null, { timeout: stageLimits.cleanup });
  const startedAt = performance.now();
  while (activeWorkers.size !== 0 && performance.now() - startedAt < stageLimits.cleanup) await new Promise((resolve) => setTimeout(resolve, 25));
  if (activeWorkers.size !== 0) throw Object.assign(new Error('worker cleanup failed'), { code: 'WORKER_ORPHANED' });
}

function writeSummary() {
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify(result, null, 2)}\n`);
}

try {
  if (!fs.existsSync(path.join(preview, 'app', 'index.html'))) throw Object.assign(new Error('preview missing'), { code: 'PREVIEW_MISSING' });
  server = await startStaticServer({ '/v4/': preview });
  const browserType = requestedBrowser === 'firefox' ? firefox : requestedBrowser === 'webkit' ? webkit : chromium;
  const launchOptions = { headless: true, timeout: stageLimits.launch };
  if (requestedBrowser === 'edge') launchOptions.channel = 'msedge';
  browser = await bounded('BROWSER_LAUNCH', stageLimits.launch, () => browserType.launch(launchOptions));
  result.version = browser.version();
  context = await bounded('CONTEXT_CREATED', stageLimits.context, () => browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }));
  page = await bounded('PAGE_TARGET_CREATED', stageLimits.page, () => context.newPage());
  page.on('worker', (worker) => {
    if (!worker.url().includes('veilforge-v4-scanner.worker')) return;
    activeWorkers.add(worker);
    worker.on('close', () => activeWorkers.delete(worker));
  });
  await bounded('PAGE_NAVIGATED', stageLimits.navigation, () => page.goto(`http://127.0.0.1:${server.port}/v4/app/`, { waitUntil: 'domcontentloaded', timeout: stageLimits.navigation }));
  await bounded('APP_READY', stageLimits.app, () => page.waitForFunction(() => window.__VEILFORGE_READY__ === true && document.body.dataset.webRuntime === 'v4', null, { timeout: stageLimits.app }));

  const first = await bounded('REAL_SCAN_COMPLETED', stageLimits.scan, () => scan(`${requestedBrowser}-first`));
  if (!/Verified result ready/u.test(first.status) || first.findings < 1) throw Object.assign(new Error('verified result missing'), { code: 'VERIFIED_REPORT_MISSING' });
  await waitForWorkerCleanup();

  const history = await bounded('HISTORY_SAVE_LOAD', stageLimits.app, async () => {
    await page.locator('#v4-refresh-history').click();
    const entry = page.locator(`[data-v4-history="${requestedBrowser}-first"]`);
    await entry.waitFor({ state: 'visible', timeout: stageLimits.app });
    await entry.click();
    return entry.count();
  });
  if (history !== 1) throw Object.assign(new Error('history missing'), { code: 'HISTORY_MISSING' });

  await bounded('EXPORT_VERIFIED', stageLimits.app, async () => {
    const downloadPromise = page.waitForEvent('download', { timeout: stageLimits.app });
    await page.locator('[data-v4-export="veilforge-report-v4.json"]').click();
    const download = await downloadPromise;
    if (download.suggestedFilename() !== 'veilforge-report-v4.json') throw Object.assign(new Error('export name'), { code: 'EXPORT_INVALID' });
    await download.delete();
  });

  await bounded('CANCEL_COMPLETED', stageLimits.scan, async () => {
    await loadProject(`${requestedBrowser}-cancel`, `pragma solidity 0.8.24; contract CancelCase { uint256 public value; } /*${'x'.repeat(500_000)}*/`);
    await page.locator('#v4-scan').click();
    await page.waitForTimeout(10);
    await page.locator('#v4-cancel').click();
    await page.locator('#v4-cancel').click({ force: true });
    const canceled = await waitForScan();
    if (!/Scan cancelled/u.test(canceled.status)) throw Object.assign(new Error('cancel failed'), { code: 'CANCEL_FAILED' });
    await waitForWorkerCleanup();
  });

  const restarted = await bounded('WORKER_RESTART_COMPLETED', stageLimits.scan, () => scan(`${requestedBrowser}-restart`));
  if (!/Verified result ready/u.test(restarted.status)) throw Object.assign(new Error('restart failed'), { code: 'WORKER_RESTART_FAILED' });
  await waitForWorkerCleanup();

  currentStage = 'REPEATED_LIFECYCLE_COMPLETED';
  const repeatedStarted = performance.now();
  for (let index = 0; index < 10; index += 1) {
    const repeated = await scan(`${requestedBrowser}-repeat-${index}`);
    if (!/Verified result ready/u.test(repeated.status) || repeated.activeRequest !== 0) throw Object.assign(new Error('repeat failed'), { code: 'REPEATED_SCAN_FAILED' });
    await waitForWorkerCleanup();
    result.repeatedScans += 1;
  }
  record('REPEATED_LIFECYCLE_COMPLETED', repeatedStarted);

  await bounded('RESPONSIVE_390', stageLimits.app, async () => {
    await page.setViewportSize({ width: 390, height: 900 });
    const responsive = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, scanVisible: Boolean(document.querySelector('#v4-scan')?.offsetParent), historyVisible: Boolean(document.querySelector('#v4-history')?.offsetParent) }));
    if (responsive.overflow || !responsive.scanVisible || !responsive.historyVisible) throw Object.assign(new Error('responsive failed'), { code: 'RESPONSIVE_FAILED' });
    result.responsive390 = true;
  });

  result.orphanWorkers = activeWorkers.size;
  result.pendingRequests = await page.evaluate(() => document.querySelector('#v4-scan')?.disabled ? 1 : 0);
  if (result.orphanWorkers !== 0 || result.pendingRequests !== 0) throw Object.assign(new Error('resources pending'), { code: 'PENDING_RESOURCES' });
  result.passed = true;
} catch (error) {
  result.errorCode = error?.code ?? `${currentStage}_FAILED`;
  result.stages.push({ stage: currentStage, status: 'failed', durationMs: null, errorCode: result.errorCode });
  process.exitCode = 1;
} finally {
  const shutdownStarted = performance.now();
  try { await page?.close(); await context?.close(); await browser?.close(); await server?.close(); result.cleanShutdown = true; record('CLEAN_SHUTDOWN', shutdownStarted); } catch { result.passed = false; result.errorCode ??= 'CLEAN_SHUTDOWN_FAILED'; process.exitCode = 1; }
  writeSummary();
  console.log(JSON.stringify({ browser: result.browser, version: result.version, passed: result.passed, repeatedScans: result.repeatedScans, orphanWorkers: result.orphanWorkers, pendingRequests: result.pendingRequests, cleanShutdown: result.cleanShutdown, errorCode: result.errorCode }));
  setTimeout(() => process.exit(process.exitCode ?? 0), 0);
}
