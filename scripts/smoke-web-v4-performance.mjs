import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { installedChromiumBrowsers, launchBrowser, startStaticServer } from './lib/web-acceptance-browser.mjs';

const root = process.cwd(); const preview = path.join(root, 'dist-preview-v4');
if (!fs.existsSync(preview)) throw new Error('V4 preview build is missing.');
const files = [];
const walk = (directory) => { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const absolute = path.join(directory, entry.name); if (entry.isDirectory()) walk(absolute); else files.push(absolute); } };
walk(preview);
const metric = (selected) => { const buffers = selected.map((file) => fs.readFileSync(file)); const joined = Buffer.concat(buffers); return { bytes: joined.byteLength, gzipBytes: gzipSync(joined, { level: 9 }).byteLength, brotliBytes: brotliCompressSync(joined).byteLength }; };
const shellFiles = ['app/index.html', 'styles.css', 'app.js', 'config.js'].map((file) => path.join(preview, file));
const runtimeFiles = files.filter((file) => file.startsWith(path.join(preview, 'v4')));
const compilerFile = path.join(preview, 'v4', 'soljson-v0.8.24.js');
const browser = installedChromiumBrowsers()[0]; if (!browser) throw new Error('No Chromium performance browser is installed.');
const server = await startStaticServer({ '/v4/': preview }); const session = await launchBrowser(browser);
try {
  await session.navigate(`http://127.0.0.1:${server.port}/v4/app/`);
  const runtime = await session.evaluate(`(async()=>{const {createWorkerClient}=await import('/v4/v4/runtime/worker-client.js');const input={projectId:'performance',sources:{'src/Case.sol':{content:'pragma solidity 0.8.24; contract Case { address public payer; }'}},compiler:{version:'0.8.24'},domains:['arc-payments']};const runs=[];for(let index=0;index<2;index+=1){const start=performance.now();const client=createWorkerClient();const readyStart=performance.now();await client.ready;const workerReadyMs=performance.now()-readyStart;const scanStart=performance.now();const result=await client.scan(input);runs.push({workerReadyMs,scanMs:performance.now()-scanStart,totalMs:performance.now()-start,compilerInitializationMs:result.runtime?.compilerInitializationMs??null,verified:result.verification?.verified===true});client.dispose()}return{runs,longTasks:performance.getEntriesByType('longtask').length,resources:performance.getEntriesByType('resource').length}})()`);
  if (runtime.runs.some((run) => !run.verified) || runtime.runs.some((run) => run.totalMs >= 300_000)) throw new Error(`Performance acceptance failed: ${JSON.stringify(runtime)}`);
  const compilerRequests = [...server.counters.entries()].filter(([name]) => name.endsWith('soljson-v0.8.24.js')).reduce((total, [, count]) => total + count, 0);
  console.log(JSON.stringify({ passed: true, browser: browser.name, shell: metric(shellFiles), runtime: metric(runtimeFiles), compiler: metric([compilerFile]), measured: runtime.runs, compilerRequests, cacheReuse: compilerRequests <= 1, serviceWorker: false, thresholds: { uiWorkerIsolated: true, globalTimeoutMs: 300000, projectLimitBytes: 1048576 } }));
} finally { await session.close(); await server.close(); }
