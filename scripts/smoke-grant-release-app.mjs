import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { browserSleep, installedChromiumBrowsers, launchBrowser, startStaticServer } from './lib/web-acceptance-browser.mjs';

const root = process.cwd();
const artifact = path.join(root, 'dist-grant-release');
if (!fs.existsSync(path.join(artifact, 'app', 'index.html'))) throw new Error('Grant release artifact is missing. Run npm run build:grant-release first.');

const browser = installedChromiumBrowsers()[0];
if (!browser) throw new Error('Chrome, Edge, or Chromium is required for the grant release app smoke.');
const server = await startStaticServer({ '/': artifact });
const session = await launchBrowser(browser);

try {
  await session.cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `globalThis.__VEILFORGE_PAGE_ERRORS__=[];
      globalThis.addEventListener('error',(event)=>globalThis.__VEILFORGE_PAGE_ERRORS__.push({type:'error',message:event.message||'resource-load-error',source:event.filename||event.target?.src||event.target?.href||''}),true);
      globalThis.addEventListener('unhandledrejection',(event)=>globalThis.__VEILFORGE_PAGE_ERRORS__.push({type:'unhandledrejection',message:String(event.reason?.stack||event.reason||'unhandled rejection'),source:''}));`,
  });
  const results = [];
  for (const route of ['/app', '/app#scanner']) {
    await session.cdp.send('Page.navigate', { url: 'about:blank' });
    await browserSleep(100);
    await session.cdp.send('Page.navigate', { url: `http://127.0.0.1:${server.port}${route}` });
    let snapshot;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      snapshot = await session.evaluate(`({
        ready: globalThis.__VEILFORGE_READY__ === true,
        runtime: document.body?.dataset.webRuntime ?? null,
        pageErrors: globalThis.__VEILFORGE_PAGE_ERRORS__ ?? [],
        projectIntakeVisible: [...document.querySelectorAll('*')].some((node) => node.textContent?.trim() === 'Project Intake' && !!node.getClientRects().length),
        scanActionVisible: [...document.querySelectorAll('button')].some((node) => /Run (?:verified V4|deterministic) scan/u.test(node.textContent ?? '') && !!node.getClientRects().length),
      })`);
      if (snapshot.ready || snapshot.pageErrors.length) break;
      await browserSleep(100);
    }
    assert.equal(snapshot?.ready, true, `${route} did not mount the V4 application shell.`);
    assert.equal(snapshot.runtime, 'v4', `${route} did not activate the V4 runtime.`);
    assert.ok(snapshot.projectIntakeVisible || snapshot.scanActionVisible, `${route} did not expose a stable V4 scanner control.`);
    assert.deepEqual(snapshot.pageErrors, [], `${route} raised an uncaught page error.`);
    results.push({ route, ready: true, runtime: snapshot.runtime, stableControlVisible: true, pageErrors: 0 });
  }
  console.log(JSON.stringify({ browser: browser.name, artifact: 'dist-grant-release', results }));
} finally {
  await session.close();
  await server.close();
}
