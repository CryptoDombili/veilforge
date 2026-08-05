import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { installedChromiumBrowsers, launchBrowser, startStaticServer } from './lib/web-acceptance-browser.mjs';

const root = process.cwd();
const preview = path.join(root, 'dist-preview-v4');
const stable = path.join(root, 'dist');
if (!/WEB_V4_ENABLED = true/u.test(fs.readFileSync(path.join(preview, 'config.js'), 'utf8')) || !/WEB_V4_ENABLED = false/u.test(fs.readFileSync(path.join(stable, 'config.js'), 'utf8'))) throw new Error('Rollback requires separate true preview and false default builds.');
const browser = installedChromiumBrowsers()[0];
if (!browser) throw new Error('No Chromium-compatible rollback browser is installed.');
const server = await startStaticServer({ '/v4/': preview, '/v3/': stable });
const session = await launchBrowser(browser);
const source = 'pragma solidity 0.8.24; contract RollbackPayment { address public payer; }';
try {
  await session.navigate(`http://127.0.0.1:${server.port}/v4/app/`);
  const v4 = await session.evaluate(`(async()=>{const input=document.querySelector('#v4-file-input');const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(source)}],'Case.sol',{type:'text/plain'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#v4-project-name').value='rollback-project';document.querySelector('#v4-scan').click();while(document.querySelector('#v4-scan').disabled)await new Promise(resolve=>setTimeout(resolve,50));return{status:document.querySelector('#v4-status strong')?.textContent,key:Object.keys(localStorage).find(key=>key.startsWith('veilforge:v4:report:'))}})()`);
  if (!/Verified result ready/u.test(v4.status) || !v4.key) throw new Error(`V4 rollback setup failed: ${JSON.stringify(v4)}`);
  const envelopeBefore = await session.evaluate(`localStorage.getItem(${JSON.stringify(v4.key)})`);

  await session.navigate(`http://127.0.0.1:${server.port}/v3/app/`);
  const stableResult = await session.evaluate(`(async()=>{const started=Date.now();while(!document.body.dataset.reportHash&&Date.now()-started<30000)await new Promise(resolve=>setTimeout(resolve,100));return{ready:window.__VEILFORGE_READY__===true,v4Mounted:!!document.querySelector('#v4-scan'),v3Report:document.body.dataset.reportHash??null,v4Envelope:localStorage.getItem(${JSON.stringify(v4.key)}),v3History:localStorage.getItem('veilforge:v3.2:scan-history')}})()`);
  if (!stableResult.ready || stableResult.v4Mounted || !stableResult.v3Report || stableResult.v4Envelope !== envelopeBefore || !stableResult.v3History) throw new Error(`V3 rollback failed: ${JSON.stringify(stableResult)}`);

  await session.navigate(`http://127.0.0.1:${server.port}/v4/app/`);
  const restored = await session.evaluate(`(async()=>{document.querySelector('#v4-refresh-history').click();await new Promise(resolve=>setTimeout(resolve,200));return{v4Mounted:!!document.querySelector('#v4-scan'),history:!!document.querySelector('[data-v4-history="rollback-project"]'),v3History:localStorage.getItem('veilforge:v3.2:scan-history')}})()`);
  if (!restored.v4Mounted || !restored.history || restored.v3History !== stableResult.v3History) throw new Error(`V4 re-enable failed: ${JSON.stringify(restored)}`);
  console.log(JSON.stringify({ passed: true, browser: browser.name, previewToV3: true, v3ScanHistory: true, v4NamespaceIgnoredByV3: true, v4HistoryRestored: true, manualSourceEdit: false }));
} finally { await session.close(); await server.close(); }
