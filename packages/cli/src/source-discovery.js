import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { PROJECT_RESOLVER_LIMITS, parseRemappingsText, resolveVirtualProject } from '../../analyzer/src/v4/frontend/project-resolver.js';
import { cliError } from './errors.js';

const EXCLUDED = new Set(['node_modules', 'lib', '.git', 'dist', 'output']);
const CONTROL = /[\u0000-\u001f\u007f]/u;
const DEFAULT_FILE_LIMIT = PROJECT_RESOLVER_LIMITS.maxPerFileBytes;
const DEFAULT_PROJECT_LIMIT = PROJECT_RESOLVER_LIMITS.maxProjectBytes;
const DEFAULT_FILE_COUNT = PROJECT_RESOLVER_LIMITS.maxFileCount;

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function safeRelative(root, absolute) {
  const relative = path.relative(root, absolute).replaceAll('\\', '/');
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative) || CONTROL.test(relative)) throw cliError('CLI_SOURCE_INVALID');
  return relative.split('/').filter((part) => part && part !== '.').map((part) => part.normalize('NFC')).join('/');
}

async function walk(root, directory, files, maxFileCount) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { throw cliError('CLI_SOURCE_INVALID'); }
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw cliError('CLI_SOURCE_INVALID', { causeCode: 'SYMLINK_ESCAPE' });
    if (entry.isDirectory()) { if (!EXCLUDED.has(entry.name)) await walk(root, path.join(directory, entry.name), files, maxFileCount); }
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.sol')) {
      files.push(path.join(directory, entry.name));
      if (files.length > maxFileCount) throw cliError('CLI_SOURCE_LIMIT_EXCEEDED', { causeCode: 'LIMIT_EXCEEDED' });
    }
  }
}

function decode(bytes, reason = 'binary-source') {
  if (bytes.includes(0)) throw cliError('CLI_SOURCE_INVALID', { safeDetails: { reason } });
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw cliError('CLI_SOURCE_INVALID', { safeDetails: { reason } }); }
}

async function remappingsAt(root, limits) {
  const filename = path.join(root, 'remappings.txt');
  const stat = await lstat(filename).catch(() => null);
  if (!stat) return [];
  if (!stat.isFile() || stat.isSymbolicLink()) throw cliError('CLI_SOURCE_INVALID', { causeCode: 'INVALID_REMAPPING' });
  if (stat.size > PROJECT_RESOLVER_LIMITS.maxRemappingBytes) throw cliError('CLI_SOURCE_LIMIT_EXCEEDED', { causeCode: 'LIMIT_EXCEEDED' });
  const bytes = await readFile(filename);
  try { return parseRemappingsText(decode(bytes, 'invalid-remappings'), limits); }
  catch (error) { throw cliError(error.code === 'LIMIT_EXCEEDED' ? 'CLI_SOURCE_LIMIT_EXCEEDED' : 'CLI_SOURCE_INVALID', { causeCode: error.code }); }
}

export async function discoverProject({ source = [], file = [], cwd = process.cwd(), settings = {}, maxFileBytes = DEFAULT_FILE_LIMIT, maxProjectBytes = DEFAULT_PROJECT_LIMIT, maxFileCount = DEFAULT_FILE_COUNT } = {}) {
  if (!Number.isInteger(maxFileBytes) || maxFileBytes <= 0 || maxFileBytes > DEFAULT_FILE_LIMIT
    || !Number.isInteger(maxProjectBytes) || maxProjectBytes <= 0 || maxProjectBytes > DEFAULT_PROJECT_LIMIT
    || !Number.isInteger(maxFileCount) || maxFileCount <= 0 || maxFileCount > DEFAULT_FILE_COUNT) {
    throw cliError('CLI_SOURCE_LIMIT_EXCEEDED', { causeCode: 'LIMIT_EXCEEDED' });
  }
  const root = path.resolve(cwd);
  const rootReal = await realpath(root).catch(() => { throw cliError('CLI_SOURCE_INVALID'); });
  const candidates = [];
  for (const directory of source) {
    const absolute = path.resolve(root, directory);
    if (!within(root, absolute)) throw cliError('CLI_SOURCE_INVALID', { causeCode: 'PATH_ESCAPE' });
    const stat = await lstat(absolute).catch(() => null);
    if (stat?.isSymbolicLink()) throw cliError('CLI_SOURCE_INVALID', { causeCode: 'SYMLINK_ESCAPE' });
    if (!stat?.isDirectory()) throw cliError('CLI_SOURCE_INVALID');
    const resolved = await realpath(absolute);
    if (!within(rootReal, resolved)) throw cliError('CLI_SOURCE_INVALID', { causeCode: 'SYMLINK_ESCAPE' });
    await walk(root, absolute, candidates, maxFileCount);
  }
  for (const filename of file) {
    const absolute = path.resolve(root, filename);
    if (!within(root, absolute)) throw cliError('CLI_SOURCE_INVALID', { causeCode: 'PATH_ESCAPE' });
    const stat = await lstat(absolute).catch(() => null);
    if (stat?.isSymbolicLink()) throw cliError('CLI_SOURCE_INVALID', { causeCode: 'SYMLINK_ESCAPE' });
    if (!stat?.isFile() || !absolute.toLowerCase().endsWith('.sol')) throw cliError('CLI_SOURCE_INVALID');
    const resolved = await realpath(absolute);
    if (!within(rootReal, resolved)) throw cliError('CLI_SOURCE_INVALID', { causeCode: 'SYMLINK_ESCAPE' });
    candidates.push(absolute);
  }
  if (!candidates.length) throw cliError('CLI_SOURCE_INVALID', { safeDetails: { reason: 'empty-source-set' } });

  const orderedCandidates = [...candidates].sort();
  const candidateIdentities = new Map();
  for (const absolute of orderedCandidates) {
    const canonical = safeRelative(root, absolute);
    const folded = canonical.toLowerCase();
    if (candidateIdentities.has(canonical) || candidateIdentities.has(folded)) throw cliError('CLI_SOURCE_INVALID', { safeDetails: { reason: 'source-path-collision' } });
    candidateIdentities.set(canonical, canonical);
    candidateIdentities.set(folded, canonical);
  }
  if (orderedCandidates.length > maxFileCount) throw cliError('CLI_SOURCE_LIMIT_EXCEEDED', { causeCode: 'LIMIT_EXCEEDED' });

  const seedSources = {};
  const seedPaths = [];
  let seedBytes = 0;
  for (const absolute of orderedCandidates) {
    const canonical = safeRelative(root, absolute);
    const current = await lstat(absolute).catch(() => null);
    if (!current?.isFile() || current.isSymbolicLink()) throw cliError('CLI_SOURCE_INVALID', { causeCode: 'SYMLINK_ESCAPE' });
    const resolved = await realpath(absolute).catch(() => { throw cliError('CLI_SOURCE_INVALID'); });
    if (!within(rootReal, resolved)) throw cliError('CLI_SOURCE_INVALID', { causeCode: 'SYMLINK_ESCAPE' });
    const resolvedStat = await lstat(resolved).catch(() => null);
    if (!resolvedStat?.isFile() || resolvedStat.isSymbolicLink()) throw cliError('CLI_SOURCE_INVALID', { causeCode: 'SYMLINK_ESCAPE' });
    if (resolvedStat.size > maxFileBytes || seedBytes + resolvedStat.size > maxProjectBytes) throw cliError('CLI_SOURCE_LIMIT_EXCEEDED', { causeCode: 'LIMIT_EXCEEDED' });
    const bytes = await readFile(resolved).catch(() => { throw cliError('CLI_SOURCE_INVALID'); });
    if (bytes.length > maxFileBytes || seedBytes + bytes.length > maxProjectBytes) throw cliError('CLI_SOURCE_LIMIT_EXCEEDED', { causeCode: 'LIMIT_EXCEEDED' });
    seedBytes += bytes.length;
    seedSources[canonical] = { content: decode(bytes) }; seedPaths.push(canonical);
  }

  const limits = { maxFileCount, maxPerFileBytes: maxFileBytes, maxProjectBytes };
  const fileRemappings = await remappingsAt(root, limits);
  try {
    const resolution = resolveVirtualProject({
      sources: seedSources,
      entrypoints: seedPaths,
      settings: { ...settings, remappings: [...(settings.remappings ?? []), ...fileRemappings] },
      limits,
      loadSource({ locatorPath, remainingProjectBytes }) {
        const absolute = path.resolve(root, ...locatorPath.split('/'));
        if (!within(root, absolute)) throw Object.assign(new Error('path escape'), { code: 'PATH_ESCAPE' });
        let stat;
        try { stat = lstatSync(absolute); } catch { return null; }
        if (!stat.isFile() && !stat.isSymbolicLink()) return null;
        let resolved;
        try { resolved = realpathSync.native(absolute); } catch { return null; }
        if (!within(rootReal, resolved)) throw Object.assign(new Error('symlink escape'), { code: 'SYMLINK_ESCAPE' });
        if (!resolved.toLowerCase().endsWith('.sol')) return null;
        let resolvedStat;
        try { resolvedStat = lstatSync(resolved); } catch { return null; }
        if (!resolvedStat.isFile() || resolvedStat.isSymbolicLink()) throw Object.assign(new Error('symlink escape'), { code: 'SYMLINK_ESCAPE' });
        if (resolvedStat.size > maxFileBytes || resolvedStat.size > remainingProjectBytes) throw Object.assign(new Error('source limit'), { code: 'LIMIT_EXCEEDED' });
        const bytes = readFileSync(resolved);
        if (bytes.length > maxFileBytes || bytes.length > remainingProjectBytes) throw Object.assign(new Error('source limit'), { code: 'LIMIT_EXCEEDED' });
        return { content: decode(bytes), virtualPath: locatorPath };
      },
    });
    return { sources: resolution.sources, resolverSources: resolution.resolverSources, settings: resolution.settings, resolution: { provenance: resolution.provenance, limits: resolution.limits } };
  } catch (error) {
    const causeCode = error?.code ?? 'MISSING_IMPORT';
    throw cliError(causeCode === 'LIMIT_EXCEEDED' ? 'CLI_SOURCE_LIMIT_EXCEEDED' : 'CLI_SOURCE_INVALID', { causeCode, safeDetails: { reason: causeCode } });
  }
}

export async function discoverSources(options = {}) {
  return (await discoverProject(options)).sources;
}
