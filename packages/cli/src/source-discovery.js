import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { cliError } from './errors.js';

const EXCLUDED = new Set(['node_modules', '.git', 'dist', 'output']);
const CONTROL = /[\u0000-\u001f\u007f]/u;
const DEFAULT_FILE_LIMIT = 2 * 1024 * 1024; const DEFAULT_PROJECT_LIMIT = 20 * 1024 * 1024;
function safeRelative(root, absolute) {
  const relative = path.relative(root, absolute).replaceAll('\\', '/');
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative) || CONTROL.test(relative)) throw cliError('CLI_SOURCE_INVALID');
  return relative.split('/').filter((part) => part && part !== '.').map((part) => part.normalize('NFC')).join('/');
}
async function walk(root, directory, files) {
  let entries; try { entries = await readdir(directory, { withFileTypes: true }); } catch { throw cliError('CLI_SOURCE_INVALID'); }
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) { if (!EXCLUDED.has(entry.name)) await walk(root, path.join(directory, entry.name), files); }
    else if (entry.isFile() && entry.name.endsWith('.sol')) files.push({ root, absolute: path.join(directory, entry.name) });
  }
}
export async function discoverSources({ source = [], file = [], cwd = process.cwd(), maxFileBytes = DEFAULT_FILE_LIMIT, maxProjectBytes = DEFAULT_PROJECT_LIMIT } = {}) {
  const candidates = [];
  for (const directory of source) { const absolute = path.resolve(cwd, directory); if ((await lstat(absolute).catch(() => null))?.isSymbolicLink()) continue; await walk(cwd, absolute, candidates); }
  for (const filename of file) { const absolute = path.resolve(cwd, filename); const stat = await lstat(absolute).catch(() => null); if (!stat?.isFile() || stat.isSymbolicLink() || !absolute.endsWith('.sol')) throw cliError('CLI_SOURCE_INVALID'); candidates.push({ root: cwd, absolute }); }
  if (!candidates.length) throw cliError('CLI_SOURCE_INVALID', { safeDetails: { reason: 'empty-source-set' } });
  const seen = new Map(); const sources = {}; let total = 0;
  for (const item of candidates.sort((a, b) => a.absolute < b.absolute ? -1 : a.absolute > b.absolute ? 1 : 0)) {
    const canonical = safeRelative(item.root, item.absolute); const folded = canonical.toLowerCase();
    if (seen.has(canonical) || seen.has(folded)) throw cliError('CLI_SOURCE_INVALID', { safeDetails: { reason: 'source-path-collision' } });
    const bytes = await readFile(item.absolute).catch(() => { throw cliError('CLI_SOURCE_INVALID'); });
    if (bytes.length > maxFileBytes || (total += bytes.length) > maxProjectBytes) throw cliError('CLI_SOURCE_LIMIT_EXCEEDED');
    if (bytes.includes(0)) throw cliError('CLI_SOURCE_INVALID', { safeDetails: { reason: 'binary-source' } });
    let content; try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw cliError('CLI_SOURCE_INVALID', { safeDetails: { reason: 'binary-source' } }); }
    seen.set(canonical, canonical); seen.set(folded, canonical); sources[canonical] = { content };
  }
  return Object.fromEntries(Object.entries(sources).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
