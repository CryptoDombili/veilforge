import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function installedChromiumBrowsers() {
  const candidates = [
    ['Chrome', process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe')],
    ['Chrome', process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')],
    ['Edge', process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe')],
    ['Edge', process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe')],
    ['Chromium', '/usr/bin/chromium'], ['Chrome', '/usr/bin/google-chrome'],
  ].filter(([, executable]) => executable && fs.existsSync(executable));
  return [...new Map(candidates.map((item) => [item[0], item])).values()].map(([name, executable]) => ({ name, executable }));
}

export function startStaticServer(routes) {
  const mime = new Map([['.html', 'text/html'], ['.js', 'text/javascript'], ['.css', 'text/css'], ['.json', 'application/json'], ['.wasm', 'application/wasm'], ['.png', 'image/png'], ['.ttf', 'font/ttf']]);
  const counters = new Map();
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const route = Object.entries(routes).sort((left, right) => right[0].length - left[0].length).find(([prefix]) => pathname.startsWith(prefix));
    if (!route) { response.writeHead(404); response.end(); return; }
    const [prefix, directory] = route;
    let relative = pathname.slice(prefix.length).replace(/^\/+/, '');
    if (!relative || relative === 'app' || relative === 'app/') relative = 'app/index.html';
    const absolute = path.resolve(directory, relative);
    if (path.relative(directory, absolute).startsWith('..') || !fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) { response.writeHead(404); response.end(); return; }
    counters.set(pathname, (counters.get(pathname) ?? 0) + 1);
    const body = fs.readFileSync(absolute);
    const cacheControl = /(?:index\.html|config\.js)$/u.test(relative) ? 'no-store' : /soljson-v0\.8\.24\.js$/u.test(relative) ? 'public, max-age=31536000, immutable' : relative.startsWith('v4/') ? 'no-cache, must-revalidate' : 'public, max-age=300';
    response.writeHead(200, { 'content-type': `${mime.get(path.extname(absolute)) ?? 'application/octet-stream'}; charset=utf-8`, 'content-length': body.byteLength, 'cache-control': cacheControl }); response.end(body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, counters, close: () => new Promise((done) => server.close(done)) })));
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url); const pending = new Map(); let nextId = 1;
    socket.addEventListener('open', () => resolve({ send(method, params = {}) { const id = nextId++; return new Promise((accept, fail) => { pending.set(id, { accept, fail }); socket.send(JSON.stringify({ id, method, params })); }); }, close() { socket.close(); } }));
    socket.addEventListener('error', () => reject(new Error('Could not connect to Chromium DevTools.')));
    socket.addEventListener('message', (event) => { const message = JSON.parse(event.data); const call = pending.get(message.id); if (!call) return; pending.delete(message.id); if (message.error) call.fail(new Error(message.error.message)); else call.accept(message.result); });
  });
}

export async function launchBrowser(browser) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'veilforge-v4-acceptance-'));
  const child = spawn(browser.executable, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  const cleanup = async () => {
    if (child.exitCode === null) child.kill('SIGKILL');
    await sleep(100);
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); } catch {}
  };
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100 && !fs.existsSync(portFile) && child.exitCode === null; attempt += 1) await sleep(100);
  if (!fs.existsSync(portFile)) { await cleanup(); throw new Error(`${browser.name} DevTools port was not created.`); }
  const debugPort = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
  let pageTarget;
  for (let attempt = 0; attempt < 50 && !pageTarget; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (response.ok) pageTarget = (await response.json()).find((target) => target.type === 'page');
    } catch {}
    if (!pageTarget) await sleep(100);
  }
  if (!pageTarget) { await cleanup(); throw new Error(`${browser.name} DevTools page target was not ready.`); }
  const cdp = await connectCdp(pageTarget.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  const evaluate = async (expression) => { const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result.value; };
  const navigate = async (url, readyExpression = 'window.__VEILFORGE_READY__===true') => { await cdp.send('Page.navigate', { url }); for (let attempt = 0; attempt < 200; attempt += 1) { if (await evaluate(readyExpression)) return; await sleep(100); } throw new Error(`${browser.name} page did not become ready: ${url}`); };
  const close = async () => { cdp.close(); await cleanup(); };
  return { browser, cdp, evaluate, navigate, close };
}

export const browserSleep = sleep;
