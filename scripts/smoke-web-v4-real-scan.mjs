import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const dist = path.join(root, 'dist');
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'veilforge-v4-worker-'));

function findChromium() {
  const candidates = [
    process.env.CHROMIUM_BIN,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  if (!executable) throw new Error('Chrome, Edge, or Chromium was not found.');
  return executable;
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url); const pending = new Map(); let nextId = 1;
    socket.addEventListener('open', () => resolve({
      send(method, params = {}) { const id = nextId++; return new Promise((accept, fail) => { pending.set(id, { accept, fail }); socket.send(JSON.stringify({ id, method, params })); }); },
      close() { socket.close(); },
    }));
    socket.addEventListener('error', () => reject(new Error('Could not connect to Chromium DevTools.')));
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data); const call = pending.get(message.id); if (!call) return;
      pending.delete(message.id); if (message.error) call.fail(new Error(message.error.message)); else call.accept(message.result);
    });
  });
}

const mime = new Map([['.html', 'text/html'], ['.js', 'text/javascript'], ['.json', 'application/json']]);
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/') { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<!doctype html><title>V4 worker smoke</title>'); return; }
  const absolute = path.resolve(dist, pathname.replace(/^\/+/, ''));
  if (path.relative(dist, absolute).startsWith('..') || !fs.existsSync(absolute)) { response.writeHead(404); response.end(); return; }
  const body = fs.readFileSync(absolute); response.writeHead(200, { 'content-type': `${mime.get(path.extname(absolute)) ?? 'application/octet-stream'}; charset=utf-8`, 'content-length': body.byteLength }); response.end(body);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const child = spawn(findChromium(), ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let cdp;
try {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100 && !fs.existsSync(portFile); attempt += 1) await sleep(100);
  if (!fs.existsSync(portFile)) throw new Error('Chromium DevTools port was not created.');
  const debugPort = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
  cdp = await connectCdp(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/` }); await sleep(200);
  const source = '// PRIVATE_SENTINEL_MUST_NOT_LEAK\npragma solidity 0.8.24; contract BrowserPayment { address public payer; }';
  const expression = `(async()=>{const {createWorkerClient}=await import('/v4/runtime/worker-client.js');const input={projectId:'browser-smoke',sources:{'src/BrowserPayment.sol':{content:${JSON.stringify(source)}}},compiler:{version:'0.8.24'},domains:['arc-payments']};const progress=[];const heapBefore=performance.memory?.usedJSHeapSize??null;const initStart=performance.now();const client=createWorkerClient();const ready=await client.ready;const initMs=performance.now()-initStart;const scanStart=performance.now();const result=await client.scan(input,{onProgress:(value)=>progress.push(value)});const scanMs=performance.now()-scanStart;const sourceLeaked=JSON.stringify(progress).includes('PRIVATE_SENTINEL_MUST_NOT_LEAK');let stageTimeoutCode=null;try{await client.scan({...input,projectId:'browser-stage-timeout'},{stageTimeoutMs:1})}catch(error){stageTimeoutCode=error.code}let globalTimeoutCode=null;try{await client.scan({...input,projectId:'browser-global-timeout'},{globalTimeoutMs:1})}catch(error){globalTimeoutCode=error.code}const nearSources=Object.fromEntries(Array.from({length:2},(_,index)=>['src/Near'+index+'.sol',{content:'pragma solidity 0.8.24; contract Near'+index+' { uint256 public value; } /*'+String(index).repeat(480000)+'*/'}]));const near=await client.scan({...input,projectId:'browser-near-limit',sources:nearSources});const abortInput={...input,projectId:'browser-abort',sources:{'src/Large.sol':{content:'pragma solidity 0.8.24; contract Large {} /*'+'x'.repeat(400000)+'*/'}}};const pending=client.scan(abortInput);await new Promise(resolve=>setTimeout(resolve,5));client.abort();client.abort();let abortCode=null;try{await pending}catch(error){abortCode=error.code}const terminated=client.disposed;const restart=createWorkerClient();await restart.ready;const restarted=await restart.scan({...input,projectId:'browser-restart'});restart.dispose();return{ready,reportVersion:result.report.reportVersion,verified:result.verification.verified,hashPayloadVersion:result.report.integrity.hashPayloadVersion,findings:result.report.findings.map(item=>item.detectorId),progressCount:progress.length,sourceLeaked,stageTimeoutCode,globalTimeoutCode,nearLimitVerified:near.verification.verified,abortCode,terminated,restarted:restarted.verification.verified,restartDisposed:restart.disposed,initMs,compilerInitializationMs:result.runtime.compilerInitializationMs,scanMs,heapBefore,heapAfter:performance.memory?.usedJSHeapSize??null};})()`;
  const evaluated = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.exception?.description ?? evaluated.exceptionDetails.text);
  const value = evaluated.result.value;
  if (!value.ready?.available || value.reportVersion !== '4.1.0' || !value.verified || value.hashPayloadVersion !== 'veilforge.report.hash.v2' || value.sourceLeaked || value.stageTimeoutCode !== 'WEB_V4_TIMEOUT' || value.globalTimeoutCode !== 'WEB_V4_TIMEOUT' || !value.nearLimitVerified || value.abortCode !== 'WEB_V4_ABORTED' || !value.terminated || !value.restarted || !value.restartDisposed) throw new Error(`Browser worker smoke failed: ${JSON.stringify(value)}`);
  console.log(JSON.stringify(value));
} finally {
  cdp?.close(); server.close(); if (child.exitCode === null) child.kill('SIGKILL');
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); } catch {}
}
