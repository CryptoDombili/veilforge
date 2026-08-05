import http from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const port = Number(valueAfter('--port') || process.env.PORT || 4174);
const host = valueAfter('--host') || process.env.HOST || '127.0.0.1';
const rootDirectory = valueAfter('--root') || 'dist';
if (!['dist', 'dist-preview-v4'].includes(rootDirectory)) throw new Error('Preview root must be dist or dist-preview-v4.');
const root = path.resolve(process.cwd(), rootDirectory);

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid port: ${port}`);

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.pdf', 'application/pdf'],
  ['.sol', 'text/plain; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

function safePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const requested = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const absolute = path.resolve(root, requested);
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return absolute;
}

async function resolveFile(pathname) {
  const candidate = safePath(pathname);
  if (!candidate) return null;
  const options = [candidate];
  if (!path.extname(candidate)) options.push(`${candidate}.html`, path.join(candidate, 'index.html'));
  for (const option of options) {
    try {
      if ((await stat(option)).isFile()) return option;
    } catch {
      // Try the next clean-URL candidate.
    }
  }
  return null;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || host}`);
    const file = await resolveFile(url.pathname);
    if (!file) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-length': body.length,
      'content-type': mimeTypes.get(path.extname(file).toLowerCase()) || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(`Local server error: ${error.message}`);
  }
});

server.listen(port, host, () => {
  console.log(`VeilForge local preview: http://${host}:${port}/`);
});
