import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { installedChromiumBrowsers, launchBrowser, startStaticServer, browserSleep } from './lib/web-acceptance-browser.mjs';

const root = process.cwd();
const preview = path.join(root, 'dist-preview-v4');
if (!fs.existsSync(path.join(preview, 'app', 'index.html')) || !/WEB_V4_ENABLED = true/u.test(fs.readFileSync(path.join(preview, 'config.js'), 'utf8'))) throw new Error('V4 preview build is missing. Run build:web-v4-preview first.');
const browsers = installedChromiumBrowsers();
if (!browsers.length) throw new Error('No Chromium-compatible acceptance browser is installed.');
const server = await startStaticServer({ '/v4/': preview });
const base = `http://127.0.0.1:${server.port}/v4/app/`;

const fixtureRoot = path.join(root, 'tests', 'corpus', 'arc-payments', 'positive', 'PAY-POS-001');
const source = fs.readFileSync(path.join(fixtureRoot, 'project', 'src', 'Case.sol'), 'utf8');
const policy = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'policy.json'), 'utf8'));
const scanExpression = (projectId, content = source, options = {}) => `(async()=>{const input=document.querySelector('#v4-file-input');const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(content)}],'Case.sol',{type:'text/plain'}));Object.defineProperty(transfer.files[0],'webkitRelativePath',{value:'src/Case.sol'});input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#v4-project-name').value=${JSON.stringify(projectId)};document.querySelectorAll('[name="v4-domain"]').forEach(node=>node.checked=node.value==='arc-payments');document.querySelector('#v4-policy-mode').value='custom';document.querySelector('#v4-policy-mode').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#v4-policy').value=${JSON.stringify(JSON.stringify(policy))};document.querySelector('#v4-scan').click();${options.cancel ? "await new Promise(resolve=>setTimeout(resolve,10));document.querySelector('#v4-cancel').click();document.querySelector('#v4-cancel').click();" : ''}const started=Date.now();while(document.querySelector('#v4-scan').disabled&&Date.now()-started<300000)await new Promise(resolve=>setTimeout(resolve,50));return{status:document.querySelector('#v4-status strong')?.textContent,text:document.querySelector('#v4-status')?.textContent,findings:document.querySelectorAll('.v4-finding').length,scanEnabled:!document.querySelector('#v4-scan').disabled,stored:[...Array(localStorage.length)].map((_,index)=>localStorage.key(index))};})()`;

const results = [];
try {
for (const browser of browsers) {
    const session = await launchBrowser(browser);
    try {
      await session.navigate(base);
      const baseline = await session.evaluate("({runtime:document.body.dataset.webRuntime,flag:document.querySelector('.versionPill')?.textContent,ready:window.__VEILFORGE_READY__===true})");
      if (baseline.runtime !== 'v4' || !/V4 RC1/u.test(baseline.flag)) throw new Error(`${browser.name} did not mount V4 preview.`);

      const first = await session.evaluate(scanExpression(`${browser.name}-first`));
      if (!/Verified result ready/u.test(first.status) || first.findings < 1 || !first.scanEnabled) throw new Error(`${browser.name} first scan failed: ${JSON.stringify(first)}`);
      const firstHash = await session.evaluate("document.querySelector('.v4-report-hash')?.textContent");
      const repeat = await session.evaluate(scanExpression(`${browser.name}-first`));
      const repeatHash = await session.evaluate("document.querySelector('.v4-report-hash')?.textContent");
      const replacementCount = await session.evaluate(`Object.keys(localStorage).filter(key=>key.startsWith('veilforge:v4:report:')&&key.includes(${JSON.stringify(browser.name.toLowerCase())})).length`);
      if (!/Verified result ready/u.test(repeat.status) || replacementCount !== 1) throw new Error(`${browser.name} replacement scan failed.`);

      const repeatedScans = 10;
      const waitForNoWorkerTargets = async () => {
        for (let attempt = 0; attempt < 40; attempt += 1) {
          const targets = await session.cdp.send('Target.getTargets');
          const activeWorkers = targets.targetInfos.filter((target) => target.type === 'worker' && target.url.includes('veilforge-v4-scanner.worker')).length;
          if (activeWorkers === 0) return 0;
          await browserSleep(25);
        }
        return -1;
      };
      for (let index = 0; index < repeatedScans; index += 1) {
        const item = await session.evaluate(scanExpression(`${browser.name}-repeat-${index}`));
        if (!/Verified result ready/u.test(item.status) || !item.scanEnabled) throw new Error(`${browser.name} repeated scan ${index + 1} failed.`);
        if (await waitForNoWorkerTargets() !== 0) throw new Error(`${browser.name} orphan worker after iteration ${index + 1}.`);
      }

      const cancel = await session.evaluate(scanExpression(`${browser.name}-cancel`, `pragma solidity 0.8.24; contract CancelCase { uint256 public value; } /*${'x'.repeat(500_000)}*/`, { cancel: true }));
      if (!/Scan cancelled/u.test(cancel.status) || !cancel.scanEnabled || cancel.stored.some((key) => key.includes(`${browser.name.toLowerCase()}-cancel`))) throw new Error(`${browser.name} cancel recovery failed: ${JSON.stringify(cancel)}`);

      const oversize = await session.evaluate(scanExpression(`${browser.name}-oversize`, `pragma solidity 0.8.24; contract Oversize {} /*${'z'.repeat(1_049_000)}*/`));
      if (!/Input rejected/u.test(oversize.status) || !oversize.scanEnabled) throw new Error(`${browser.name} oversize rejection failed.`);

      const quota = await session.evaluate(`(async()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')};const result=await ${scanExpression(`${browser.name}-quota`)};Storage.prototype.setItem=original;return result})()`);
      if (!/Verified result ready/u.test(quota.status) || !/History not saved/u.test(quota.text)) throw new Error(`${browser.name} quota recovery failed.`);

      const corrupt = await session.evaluate(`(async()=>{localStorage.setItem('veilforge:v3.2:scan-history','[{"id":"legacy"}]');localStorage.setItem('veilforge:v4:report:corrupt','{bad');document.querySelector('#v4-refresh-history').click();await new Promise(resolve=>setTimeout(resolve,100));const rejected=!!document.querySelector('#v4-clear-rejected');document.querySelector('#v4-clear-rejected')?.click();await new Promise(resolve=>setTimeout(resolve,100));return{rejected,v3:localStorage.getItem('veilforge:v3.2:scan-history'),v4:Object.keys(localStorage).filter(key=>key.startsWith('veilforge:v4:')).length}})()`);
      if (!corrupt.rejected || !corrupt.v3?.includes('legacy') || corrupt.v4 !== 0) throw new Error(`${browser.name} corrupt-history recovery failed.`);

      await session.evaluate(scanExpression(`<img src=x onerror=alert(1)>`));
      const injection = await session.evaluate("({injected:!!document.querySelector('#v4-summary img'),raw:document.querySelector('#v4-summary')?.innerHTML.includes('onerror=')})");
      if (injection.injected || injection.raw) throw new Error(`${browser.name} project-name escaping failed.`);

      await session.evaluate("document.querySelector('[data-v4-finding]')?.click()");
      if (!await session.evaluate("document.querySelector('#v4-detail')?.open")) throw new Error(`${browser.name} detail dialog did not open.`);
      const escapeKey = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 };
      await session.cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...escapeKey });
      await session.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...escapeKey });
      await browserSleep(100);
      if (await session.evaluate("document.querySelector('#v4-detail')?.open")) throw new Error(`${browser.name} Escape did not close detail dialog.`);

      const viewports = [];
      for (const width of [1920, 1440, 1280, 1024, 768, 390, 360]) {
        await session.cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 }); await browserSleep(80);
        viewports.push(await session.evaluate(`({width:${width},overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,scan:!!document.querySelector('#v4-scan')?.offsetParent,history:!!document.querySelector('#v4-history')?.offsetParent,hashWidth:document.querySelector('.v4-report-hash')?.scrollWidth??0,viewport:document.documentElement.clientWidth})`));
      }
      if (viewports.some((item) => item.overflow || !item.scan || !item.history || item.hashWidth > item.viewport)) throw new Error(`${browser.name} responsive acceptance failed: ${JSON.stringify(viewports)}`);

      const privacy = await session.evaluate("({sourceInStorage:[...Array(localStorage.length)].map((_,i)=>localStorage.getItem(localStorage.key(i))).join('').includes('contract Payment'),runtimeErrors:document.body.dataset.runtimeError??null,workerTargets:performance.getEntriesByType('resource').filter(item=>item.name.includes('scanner.worker')).length})");
      if (privacy.sourceInStorage || privacy.runtimeErrors) throw new Error(`${browser.name} privacy/runtime acceptance failed: ${JSON.stringify(privacy)}`);
      results.push({ browser: browser.name, firstFindings: first.findings, deterministicRepeat: firstHash === repeatHash, repeatedScans, orphanWorkers: 0, cancel: true, quotaRecovery: true, corruptHistoryRecovery: true, responsive: viewports.map((item) => item.width), sourcePersisted: false });
      console.log(JSON.stringify({ browser: browser.name, passed: true, repeatedScans }));
    } finally { await session.close(); }
  }
  console.log(JSON.stringify({ passed: true, browsers: results }));
} finally { await server.close(); }
