import { startArcMainnetProductionServer } from './serve-arc-mainnet-production.mjs';

const server = await startArcMainnetProductionServer();
try {
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  for (const [route, expectedStatus] of [['/', 200], ['/app', 308], ['/app/', 200], ['/whitepaper', 308], ['/whitepaper/', 200]]) {
    const response = await fetch(`${origin}${route}`, { redirect: 'manual' });
    if (response.status !== expectedStatus) throw new Error(`Production route failed: ${route} (${response.status})`);
    const csp = response.headers.get('content-security-policy') ?? '';
    if (!/frame-ancestors 'none'/u.test(csp)
      || !/script-src 'self'/u.test(csp)
      || !/connect-src 'self' https:\/\/rpc\.mainnet\.arc\.io https:\/\/explorer\.arc\.io/u.test(csp)
      || response.headers.get('x-frame-options') !== 'DENY'
      || response.headers.get('x-content-type-options') !== 'nosniff') {
      throw new Error(`Production security headers failed for ${route}.`);
    }
  }
  console.log('Arc Mainnet production artifact security headers verified over HTTP.');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
