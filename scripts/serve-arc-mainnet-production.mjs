import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const MIME = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.pdf', 'application/pdf'], ['.sol', 'text/plain; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'], ['.txt', 'text/plain; charset=utf-8'],
]);

function hostingHeaders(config) {
  const rule = config.headers?.find((item) => item.source === '/(.*)');
  if (!rule?.headers?.length) throw new Error('Production hosting headers are missing.');
  const headers = Object.fromEntries(rule.headers.map(({ key, value }) => [key, value]));
  const csp = headers['Content-Security-Policy'] ?? '';
  if (!/(?:^|;)\s*frame-ancestors 'none'(?:;|$)/u.test(csp) || headers['X-Frame-Options'] !== 'DENY') {
    throw new Error('Production anti-framing headers are invalid.');
  }
  if (/\b(?:default|script|connect)-src[^;]*\*/u.test(csp) || /script-src[^;]*'unsafe-(?:inline|eval)'/u.test(csp)) {
    throw new Error('Production CSP contains an unsafe wildcard or script capability.');
  }
  return Object.freeze(headers);
}

export async function startArcMainnetProductionServer({ root = path.resolve('dist-mainnet-production'), configPath = path.resolve('vercel.json'), host = '127.0.0.1', port = 0 } = {}) {
  const resolvedRoot = path.resolve(root);
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  if (config.outputDirectory !== 'dist-mainnet-production') throw new Error('Hosting config does not target the production artifact.');
  const securityHeaders = hostingHeaders(config);

  const resolveFile = async (pathname) => {
    const decoded = decodeURIComponent(pathname);
    const requested = decoded === '/' ? 'index.html' : decoded.replace(/^\/+|\/+$/gu, '');
    const candidate = path.resolve(resolvedRoot, requested);
    const relative = path.relative(resolvedRoot, candidate);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
    const candidates = path.extname(candidate) ? [candidate] : [`${candidate}.html`, path.join(candidate, 'index.html')];
    for (const item of candidates) {
      try { if ((await stat(item)).isFile()) return item; } catch { /* try the next clean route */ }
    }
    return null;
  };

  const server = http.createServer(async (request, response) => {
    const baseHeaders = { ...securityHeaders, 'Cache-Control': 'no-store' };
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || host}`);
      if (url.pathname !== '/' && !path.posix.extname(url.pathname) && !url.pathname.endsWith('/')) {
        try {
          if ((await stat(path.join(resolvedRoot, url.pathname.replace(/^\//u, '')))).isDirectory()) {
            response.writeHead(308, { ...baseHeaders, Location: `${url.pathname}/${url.search}` });
            response.end();
            return;
          }
        } catch { /* resolve as a clean HTML route below */ }
      }
      const file = await resolveFile(url.pathname);
      if (!file) {
        response.writeHead(404, { ...baseHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, { ...baseHeaders, 'Content-Length': body.length, 'Content-Type': MIME.get(path.extname(file).toLowerCase()) ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(500, { ...baseHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Local production server error.');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const requestedPort = Number(process.env.PORT || 4176);
  const server = await startArcMainnetProductionServer({ port: requestedPort });
  const address = server.address();
  console.log(`VeilForge Arc Mainnet production-like server: http://127.0.0.1:${address.port}/`);
}
