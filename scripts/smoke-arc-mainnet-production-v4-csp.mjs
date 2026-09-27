import fs from 'node:fs';
import path from 'node:path';
import { installedChromiumBrowsers, launchBrowser } from './lib/web-acceptance-browser.mjs';
import { verifyWebV4RuntimeAssets } from './lib/web-v4-runtime-assets.mjs';
import { startArcMainnetProductionServer } from './serve-arc-mainnet-production.mjs';

const root = process.cwd();
const output = path.join(root, 'dist-mainnet-production');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const headers = Object.fromEntries(vercel.headers.find((item) => item.source === '/(.*)').headers.map(({ key, value }) => [key, value]));
const assets = verifyWebV4RuntimeAssets(output, { csp: headers['Content-Security-Policy'] });
const browser = installedChromiumBrowsers()[0];
if (!browser) throw new Error('A Chromium browser is required for the production CSP smoke scan.');

const server = await startArcMainnetProductionServer({ root: output });
const origin = `http://127.0.0.1:${server.address().port}`;
let session;
try {
  for (const relative of assets.reachableModules) {
    const response = await fetch(`${origin}/${relative}`);
    if (response.status !== 200) throw new Error(`Reachable V4 module did not return HTTP 200: ${relative}.`);
    if (!/^(?:text|application)\/javascript\b/iu.test(response.headers.get('content-type') ?? '')) throw new Error(`Reachable V4 module has an invalid JavaScript MIME type: ${relative}.`);
  }

  session = await launchBrowser(browser);
  await session.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    globalThis.__VEILFORGE_CSP_VIOLATIONS__ = [];
    addEventListener('securitypolicyviolation', (event) => {
      const blockedURI = (() => {
        if (/^[a-z][a-z0-9+.-]*-eval$/u.test(event.blockedURI)) return event.blockedURI;
        if (['blob', 'data'].includes(event.blockedURI)) return event.blockedURI + ':';
        try { const parsed = new URL(event.blockedURI); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : parsed.protocol; } catch { return null; }
      })();
      let sourceFile = null;
      try { const pathname = new URL(event.sourceFile).pathname; const marker = pathname.lastIndexOf('/v4/'); if (marker >= 0) sourceFile = pathname.slice(marker + 1); } catch {}
      globalThis.__VEILFORGE_CSP_VIOLATIONS__.push({ effectiveDirective: event.effectiveDirective || null, violatedDirective: event.violatedDirective?.split(/\\s+/u)[0] || null, blockedURI, sourceFile, lineNumber: Number.isInteger(event.lineNumber) ? event.lineNumber : null });
    });
  ` });
  await session.navigate(`${origin}/app/`);
  const source = 'pragma solidity 0.8.24; contract SmokeTest { bytes32 public payerReference; constructor(bytes32 value) { payerReference = value; } }';
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'corpus', 'arc-payments', 'positive', 'PAY-POS-001', 'policy.json'), 'utf8'));
  const scan = await session.evaluate(`(async()=>{
    const input=document.querySelector('#v4-file-input');
    const transfer=new DataTransfer();
    const file=new File([${JSON.stringify(source)}],'SmokeTest.sol',{type:'text/plain'});
    Object.defineProperty(file,'webkitRelativePath',{value:'src/SmokeTest.sol'});
    transfer.items.add(file); input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('#v4-project-name').value='production-csp-smoke';
    document.querySelectorAll('[name="v4-domain"]').forEach(node=>node.checked=node.value==='arc-payments');
    const mode=document.querySelector('#v4-policy-mode'); mode.value='custom'; mode.dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelector('#v4-policy').value=${JSON.stringify(JSON.stringify(policy))};
    const [{browserFilesToScanInput},{createWorkerClient},{verifyV4Report}]=await Promise.all([import('/v4/input-adapter.js'),import('/v4/runtime/worker-client.js'),import('/v4/report-adapter.js')]);
    const scanInput=await browserFilesToScanInput([...input.files],{projectId:'production-csp-smoke',projectName:'Production CSP Smoke',domains:['arc-payments'],compilerVersion:'0.8.24',policy:${JSON.stringify(policy)}});
    const client=createWorkerClient();
    try { await client.ready; const result=await client.scan(scanInput); const verification=await verifyV4Report(result.report); return {configured:true,workerReady:true,verified:verification.verified===true,reportHash:verification.reportHash,violations:globalThis.__VEILFORGE_CSP_VIOLATIONS__}; }
    finally { client.dispose(); }
  })()`);
  if (!scan.configured || !scan.workerReady || !scan.verified || !scan.reportHash || scan.violations.length) throw new Error(`Real production-CSP SmokeTest.sol scan did not complete and verify cleanly: ${JSON.stringify(scan)}.`);

  const negative = await session.evaluate(`(async()=>{
    const before=globalThis.__VEILFORGE_CSP_VIOLATIONS__.length;
    const script=document.createElement('script'); script.src='https://unauthorized.invalid/veilforge-probe.js'; document.head.append(script);
    let workerBlocked=false; try { const worker=new Worker('data:text/javascript,postMessage(1)'); worker.terminate(); } catch { workerBlocked=true; }
    await new Promise(resolve=>setTimeout(resolve,150)); script.remove();
    const violations=globalThis.__VEILFORGE_CSP_VIOLATIONS__.slice(before);
    return {scriptBlocked:violations.some(item=>item.effectiveDirective?.startsWith('script-src')&&item.blockedURI==='https://unauthorized.invalid'),workerBlocked:workerBlocked||violations.some(item=>item.effectiveDirective==='worker-src'&&item.blockedURI==='data:'),violations};
  })()`);
  if (!negative.scriptBlocked || !negative.workerBlocked) throw new Error(`Strict production CSP did not reject unauthorized script and worker probes: ${JSON.stringify(negative)}.`);
  console.log(JSON.stringify({ passed: true, browser: browser.name, configure: true, workerInitialized: true, orchestrationLoaded: true, compilerLoaded: true, scanCompleted: true, reportVerified: true, reachableModules: assets.reachableModuleCount, moduleHttp200: true, moduleMime: 'text/javascript', scannerCspViolations: 0, unauthorizedScriptBlocked: true, unauthorizedWorkerBlocked: true }));
} finally {
  await session?.close();
  await new Promise((resolve) => server.close(resolve));
}
