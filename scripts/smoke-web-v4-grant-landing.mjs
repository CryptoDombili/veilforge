import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { installedChromiumBrowsers, launchBrowser, browserSleep } from './lib/web-acceptance-browser.mjs';

const root = process.cwd();
const dist = path.join(root, 'dist-preview-v4');
const responsive = process.argv.includes('--responsive');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  const build = spawnSync(process.execPath, ['scripts/build-web-v4-preview.mjs'], { cwd: root, stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const mime = new Map([['.html','text/html; charset=utf-8'],['.css','text/css; charset=utf-8'],['.js','text/javascript; charset=utf-8'],['.svg','image/svg+xml; charset=utf-8'],['.pdf','application/pdf'],['.png','image/png'],['.ttf','font/ttf']]);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  let relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let absolute = path.resolve(dist, relative);
  if (!path.extname(absolute) && fs.existsSync(path.join(absolute, 'index.html'))) absolute = path.join(absolute, 'index.html');
  if (path.relative(dist, absolute).startsWith('..') || !fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) { response.writeHead(404); response.end(); return; }
  const body = fs.readFileSync(absolute); response.writeHead(200, {'content-type':mime.get(path.extname(absolute)) ?? 'application/octet-stream','content-length':body.length,'cache-control':'no-store'}); response.end(body);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = installedChromiumBrowsers()[0];
if (!browser) throw new Error('Chrome, Edge, or Chromium was not found.');
const page = await launchBrowser(browser);
try {
  await page.navigate(`${base}/`, "document.readyState==='complete' && document.body.classList.contains('v4-grant-landing')");
  const assetResults = await page.evaluate(`Promise.all(['/whitepaper/','/whitepaper/executive-brief.html','/whitepaper/VeilForge_V4_Whitepaper.pdf','/whitepaper/VeilForge_V4_Executive_Brief.pdf','/whitepaper/figures/veilforge-architecture.svg'].map(async path=>{const response=await fetch(${JSON.stringify(base)}+path);return{path,status:response.status,type:response.headers.get('content-type')}}))`);
  if (assetResults.some((item) => item.status !== 200) || !/application\/pdf/u.test(assetResults[2].type) || !/image\/svg\+xml/u.test(assetResults[4].type)) throw new Error(`Static asset failure: ${JSON.stringify(assetResults)}`);
  if (responsive) {
    const viewports = [[1920,1080],[1440,900],[1280,720],[1024,768],[768,1024],[390,844],[360,800]];
    const results = [];
    for (const [width,height] of viewports) {
      await page.cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600}); await browserSleep(80);
      results.push(await page.evaluate(`(()=>{const logo=document.querySelector('.landing-topbar .logo').getBoundingClientRect();const badge=document.querySelector('.release-badge').getBoundingClientRect();const heading=document.querySelector('.hero-copy h1').getBoundingClientRect();return{width:${width},height:${height},overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,logoBadge:Math.round(badge.top-logo.bottom),badgeHeading:Math.round(heading.top-badge.bottom),sections:document.querySelectorAll('.grant-section').length}})()`));
    }
    const expected = (item) => item.width >= 1600 ? item.logoBadge >= 80 && item.logoBadge <= 110 && item.badgeHeading >= 64 && item.badgeHeading <= 88 : item.width >= 1200 ? item.logoBadge >= 64 && item.logoBadge <= 96 && item.badgeHeading >= 48 && item.badgeHeading <= 76 : item.width >= 700 ? item.logoBadge >= 48 && item.logoBadge <= 64 && item.badgeHeading >= 38 && item.badgeHeading <= 52 : item.logoBadge >= 30 && item.logoBadge <= 44 && item.badgeHeading >= 28 && item.badgeHeading <= 40;
    if (results.some((item) => item.overflow || item.sections < 4 || !expected(item))) throw new Error(`Responsive grant landing failure: ${JSON.stringify(results)}`);
    console.log(JSON.stringify({responsive:true,viewports:results}));
  } else {
    const landing = await page.evaluate(`(()=>({hero:document.querySelector('h1')?.textContent.trim(),proof:document.querySelector('.grant-proof-strip')?.textContent,links:[...document.querySelectorAll('a')].map(a=>a.getAttribute('href')),v3Visible:[...document.querySelectorAll('.product,.workflow,.cta')].some(node=>node.offsetParent)}))()`);
    if (!/Find privacy exposure/u.test(landing.hero) || !/56 TP \/ 0 FP \/ 0 FN/u.test(landing.proof) || landing.v3Visible) throw new Error(`Grant landing content failure: ${JSON.stringify(landing)}`);
    await page.navigate(`${base}/whitepaper/`, "document.readyState==='complete' && document.querySelectorAll('figure img').length===5");
    const whitepaper = await page.evaluate(`({path:location.pathname,title:document.title,figures:document.querySelectorAll('figure img').length})`);
    await page.navigate(`${base}/whitepaper/executive-brief.html`, "document.readyState==='complete' && /Executive Brief/u.test(document.title)");
    const navigation = await page.cdp.send('Page.getNavigationHistory');
    await page.cdp.send('Page.navigateToHistoryEntry',{entryId:navigation.entries[navigation.currentIndex-1].id});
    for(let i=0;i<100&&!await page.evaluate(`location.pathname==='/whitepaper/'`);i+=1)await browserSleep(25);
    const historyBack = await page.evaluate(`({path:location.pathname,figures:document.querySelectorAll('figure img').length})`);
    await page.cdp.send('Page.reload'); for(let i=0;i<100&&!await page.evaluate(`document.readyState==='complete'`);i+=1)await browserSleep(25);
    const whitepaperRefresh = await page.evaluate(`({path:location.pathname,figures:document.querySelectorAll('figure img').length})`);
    if (whitepaper.path !== '/whitepaper/' || whitepaper.figures !== 5 || historyBack.path !== '/whitepaper/' || historyBack.figures !== 5 || whitepaperRefresh.path !== '/whitepaper/' || whitepaperRefresh.figures !== 5) throw new Error(`Whitepaper route/history failure: ${JSON.stringify({whitepaper,historyBack,whitepaperRefresh})}`);
    await page.cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:"window.__firstShell=null;new MutationObserver((_,observer)=>{if(document.body&&!window.__firstShell){window.__firstShell={v4Pending:document.body.classList.contains('v4-preview-pending'),bodyClass:document.body.className};observer.disconnect()}}).observe(document,{childList:true,subtree:true})"});
    await page.navigate(`${base}/app/index.html#scanner`);
    const direct = await page.evaluate(`({runtime:document.body.dataset.webRuntime,first:window.__firstShell,ready:window.__VEILFORGE_READY__===true})`);
    await page.cdp.send('Page.reload'); for(let i=0;i<100&&!await page.evaluate(`window.__VEILFORGE_READY__===true`);i+=1)await browserSleep(50);
    const refreshed = await page.evaluate(`({runtime:document.body.dataset.webRuntime,ready:window.__VEILFORGE_READY__===true})`);
    if (direct.runtime !== 'v4' || !direct.ready || !direct.first?.v4Pending || refreshed.runtime !== 'v4' || !refreshed.ready) throw new Error(`Route flash/direct/refresh failure: ${JSON.stringify({direct,refreshed})}`);
    console.log(JSON.stringify({landing:true,assets:assetResults,whitepaper,historyBack,whitepaperRefresh,routeFlash:false,directV4:true,refreshV4:true}));
  }
} finally { await page.close(); await new Promise((resolve)=>server.close(resolve)); }
