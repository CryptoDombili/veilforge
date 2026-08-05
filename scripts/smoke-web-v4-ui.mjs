import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';

const root = process.cwd();
const dist = path.join(root, 'dist');
const responsive = process.argv.includes('--responsive');
const configPath = path.join(dist, 'config.js');
if (!fs.existsSync(configPath) || !/WEB_V4_ENABLED = true/u.test(fs.readFileSync(configPath, 'utf8'))) {
  const build = spawnSync(process.execPath, ['scripts/build-web.mjs'], { cwd: root, env: { ...process.env, VEILFORGE_WEB_V4_ENABLED: 'true' }, stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'veilforge-v4-ui-'));
function findChromium() {
  const candidates = [process.env.CHROMIUM_BIN, process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'), process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'), process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'), process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'), '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  if (!executable) throw new Error('Chrome, Edge, or Chromium was not found.');
  return executable;
}
function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url); const pending = new Map(); let nextId = 1;
    socket.addEventListener('open', () => resolve({ send(method, params = {}) { const id = nextId++; return new Promise((accept, fail) => { pending.set(id, { accept, fail }); socket.send(JSON.stringify({ id, method, params })); }); }, close() { socket.close(); } }));
    socket.addEventListener('error', () => reject(new Error('Could not connect to Chromium DevTools.')));
    socket.addEventListener('message', (event) => { const message = JSON.parse(event.data); const call = pending.get(message.id); if (!call) return; pending.delete(message.id); if (message.error) call.fail(new Error(message.error.message)); else call.accept(message.result); });
  });
}
const mime = new Map([['.html', 'text/html'], ['.js', 'text/javascript'], ['.css', 'text/css'], ['.json', 'application/json'], ['.wasm', 'application/wasm'], ['.png', 'image/png']]);
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const relative = pathname === '/' || pathname === '/app/' ? 'app/index.html' : pathname.replace(/^\/+/, '');
  const absolute = path.resolve(dist, relative);
  if (path.relative(dist, absolute).startsWith('..') || !fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) { response.writeHead(404); response.end(); return; }
  const body = fs.readFileSync(absolute); response.writeHead(200, { 'content-type': `${mime.get(path.extname(absolute)) ?? 'application/octet-stream'}; charset=utf-8`, 'content-length': body.byteLength }); response.end(body);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const child = spawn(findChromium(), ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let cdp;
async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
try {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100 && !fs.existsSync(portFile); attempt += 1) await sleep(100);
  if (!fs.existsSync(portFile)) throw new Error('Chromium DevTools port was not created.');
  const debugPort = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
  cdp = await connectCdp(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/app/` });
  for (let attempt = 0; attempt < 100; attempt += 1) { if (await evaluate('window.__VEILFORGE_READY__===true')) break; await sleep(100); }
  if (!await evaluate("document.body.dataset.webRuntime==='v4' && !!document.querySelector('#v4-scan')")) throw new Error('V4 UI did not mount.');
  if (responsive) {
    const results = [];
    for (const width of [1440, 1280, 768, 390]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 }); await sleep(100);
      results.push(await evaluate(`(()=>({width:${width},overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,scanVisible:!!document.querySelector('#v4-scan')?.offsetParent,resultsWidth:document.querySelector('.v4-results')?.getBoundingClientRect().width??0}))()`));
    }
    if (results.some((item) => item.overflow || !item.scanVisible || item.resultsWidth <= 0)) throw new Error(`Responsive V4 smoke failed: ${JSON.stringify(results)}`);
    console.log(JSON.stringify({ responsive: true, viewports: results }));
  } else {
    const cases = [
      ['PAY-POS-001', 'arc-payments', 'positive'],
      ['TRE-NEG-001', 'arc-treasury', 'negative'],
      ['CRD-ADV-001', 'arc-private-credit', 'adversarial'],
    ].map(([id, domain, kind]) => {
      const base = path.join(root, 'tests', 'corpus', domain, kind, id);
      return { id, domain, source: fs.readFileSync(path.join(base, 'project', 'src', 'Case.sol'), 'utf8'), policy: JSON.parse(fs.readFileSync(path.join(base, 'policy.json'), 'utf8')) };
    });
    const results = [];
    for (const item of cases) {
      const expression = `(async()=>{const source=${JSON.stringify(item.source)};const input=document.querySelector('#v4-file-input');const transfer=new DataTransfer();transfer.items.add(new File([source],'Case.sol',{type:'text/plain'}));Object.defineProperty(transfer.files[0],'webkitRelativePath',{value:'src/Case.sol'});input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#v4-project-name').value=${JSON.stringify(item.id)};document.querySelectorAll('[name="v4-domain"]').forEach(node=>node.checked=node.value===${JSON.stringify(item.domain)});document.querySelector('#v4-policy-mode').value='custom';document.querySelector('#v4-policy-mode').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#v4-policy').value=${JSON.stringify(JSON.stringify(item.policy))};document.querySelector('#v4-scan').click();const started=Date.now();while(document.querySelector('#v4-scan').disabled&&Date.now()-started<300000)await new Promise(resolve=>setTimeout(resolve,100));return{id:${JSON.stringify(item.id)},status:document.querySelector('#v4-status strong')?.textContent,findings:document.querySelectorAll('.v4-finding').length,summary:document.querySelector('#v4-summary')?.textContent,stored:[...Array(localStorage.length)].map((_,i)=>localStorage.getItem(localStorage.key(i))).join(''),runtimeError:document.body.dataset.runtimeError??null};})()`;
      results.push(await evaluate(expression));
    }
    const [payment, treasury, credit] = results;
    if (!/Verified result ready/u.test(payment.status) || payment.findings < 1 || !/Verified result ready/u.test(treasury.status) || treasury.findings !== 0 || !/Incomplete/u.test(credit.summary) || results.some((item) => item.stored.includes('contract Case') || item.runtimeError)) throw new Error(`V4 UI smoke failed: ${JSON.stringify(results)}`);
    console.log(JSON.stringify({ verified: true, paymentFindings: payment.findings, treasuryFindings: treasury.findings, creditIncomplete: true, sourcePersisted: false }));
  }
} finally {
  cdp?.close(); server.close(); if (child.exitCode === null) child.kill('SIGKILL');
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); } catch {}
}
