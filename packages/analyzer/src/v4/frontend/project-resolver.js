import { FrontendError } from './errors.js';
import { compareCodePoints, normalizeSourceBundle } from './standard-json.js';
import { extractImports } from './import-graph.js';

const SCHEME = /^[a-z][a-z0-9+.-]*:/iu;
const ABSOLUTE = /^(?:\/|[a-z]:[\\/]|\\\\|\/\/)/iu;
const ENCODED_SEPARATOR = /%(?:2e|2f|5c)/iu;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const NON_PORTABLE_SEGMENT = /[:*?"<>|]/u;
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu;
const encoder = new TextEncoder();

export const PROJECT_RESOLVER_LIMITS = Object.freeze({
  maxFileCount: 1024,
  maxPerFileBytes: 2 * 1024 * 1024,
  maxProjectBytes: 20 * 1024 * 1024,
  maxImportDepth: 64,
  maxRemappingCount: 64,
  maxRemappingBytes: 16 * 1024,
  maxImportSpecifierBytes: 1024,
});

export class ProjectResolutionError extends FrontendError {
  constructor(code, details = {}) {
    super(code, 'Solidity project dependency resolution failed.', details);
  }
}

function fail(code, details = {}) { throw new ProjectResolutionError(code, details); }
function bytes(value) { return encoder.encode(String(value)).byteLength; }
function posixDirname(value) { const at = value.lastIndexOf('/'); return at < 0 ? '' : value.slice(0, at); }

function boundedLimits(value = {}) {
  const result = { ...PROJECT_RESOLVER_LIMITS };
  for (const [key, limit] of Object.entries(value)) {
    if (!(key in result) || !Number.isInteger(limit) || limit <= 0 || limit > PROJECT_RESOLVER_LIMITS[key]) fail('LIMIT_EXCEEDED', { limit: key });
    result[key] = limit;
  }
  return Object.freeze(result);
}

function safeSegments(value, { allowParent = false, code = 'PATH_ESCAPE' } = {}) {
  const original = String(value ?? '');
  if (!original || CONTROL.test(original) || ENCODED_SEPARATOR.test(original) || ABSOLUTE.test(original)) fail(code);
  if (SCHEME.test(original)) fail(['http:', 'https:', 'ipfs:', 'ipns:'].some((scheme) => original.toLowerCase().startsWith(scheme)) ? 'UNSUPPORTED_IMPORT_SCHEME' : code);
  const segments = [];
  for (const raw of original.replaceAll('\\', '/').split('/')) {
    if (!raw || raw === '.') continue;
    if (raw === '..') {
      if (!allowParent || !segments.length) fail(code);
      segments.pop();
      continue;
    }
    const segment = raw.normalize('NFC');
    if (NON_PORTABLE_SEGMENT.test(segment) || /[. ]$/u.test(segment) || WINDOWS_DEVICE.test(segment)) fail(code);
    segments.push(segment);
  }
  if (!segments.length) fail(code);
  return segments;
}

function joinRelative(base, value) {
  const segments = base ? base.split('/') : [];
  for (const raw of String(value).replaceAll('\\', '/').split('/')) {
    if (!raw || raw === '.') continue;
    if (raw === '..') { if (!segments.length) fail('PATH_ESCAPE'); segments.pop(); }
    else {
      const segment = raw.normalize('NFC');
      if (NON_PORTABLE_SEGMENT.test(segment) || /[. ]$/u.test(segment) || WINDOWS_DEVICE.test(segment)) fail('PATH_ESCAPE');
      segments.push(segment);
    }
  }
  if (!segments.length) fail('PATH_ESCAPE');
  return segments.join('/');
}

function remappingRecord(value) {
  const text = String(value ?? '').trim();
  const separator = text.indexOf('=');
  if (!text || separator <= 0 || separator !== text.lastIndexOf('=') || separator === text.length - 1 || CONTROL.test(text)) fail('INVALID_REMAPPING');
  const prefix = text.slice(0, separator).replaceAll('\\', '/').normalize('NFC');
  const rawTarget = text.slice(separator + 1);
  if (prefix.startsWith('/') || prefix.startsWith('.') || prefix.includes('..') || NON_PORTABLE_SEGMENT.test(prefix) || SCHEME.test(prefix) || ABSOLUTE.test(prefix) || ENCODED_SEPARATOR.test(prefix)) fail('INVALID_REMAPPING');
  const target = safeSegments(rawTarget, { code: 'INVALID_REMAPPING' }).join('/') + (/[\\/]$/u.test(rawTarget) ? '/' : '');
  return { prefix, target, text: `${prefix}=${target}` };
}

export function normalizeProjectRemappings(remappings = [], limits = {}) {
  const applied = boundedLimits(limits);
  if (!Array.isArray(remappings) || remappings.length > applied.maxRemappingCount) fail('LIMIT_EXCEEDED', { limit: 'remappings' });
  if (bytes(remappings.join('\n')) > applied.maxRemappingBytes) fail('LIMIT_EXCEEDED', { limit: 'remapping-bytes' });
  const byPrefix = new Map();
  for (const item of remappings.map(remappingRecord)) {
    if (byPrefix.has(item.prefix) && byPrefix.get(item.prefix).target !== item.target) fail('INVALID_REMAPPING', { reason: 'conflicting-prefix' });
    byPrefix.set(item.prefix, item);
  }
  return [...byPrefix.values()].sort((a, b) => b.prefix.length - a.prefix.length || compareCodePoints(a.prefix, b.prefix));
}

export function parseRemappingsText(text, limits = {}) {
  if (bytes(text ?? '') > boundedLimits(limits).maxRemappingBytes) fail('LIMIT_EXCEEDED', { limit: 'remapping-bytes' });
  return normalizeProjectRemappings(String(text ?? '').split(/\r?\n/u).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')), limits).map((item) => item.text);
}

function sourceEntries(bundle) {
  if (Array.isArray(bundle)) return bundle.map((source) => [source.path, source.content]);
  return Object.entries(bundle ?? {}).map(([name, value]) => [name, value?.content ?? value]);
}

function dependencyPath(path) {
  return path.startsWith('node_modules/') || path.includes('/node_modules/') || path.startsWith('lib/') || /^([^/]+)\/lib\//u.test(path);
}

function importTarget(importer, specifier, remappings, limits) {
  if (bytes(specifier) > limits.maxImportSpecifierBytes) fail('LIMIT_EXCEEDED', { limit: 'import-specifier' });
  if (SCHEME.test(specifier)) fail(['http:', 'https:', 'ipfs:', 'ipns:'].some((scheme) => specifier.toLowerCase().startsWith(scheme)) ? 'UNSUPPORTED_IMPORT_SCHEME' : 'PATH_ESCAPE');
  if (ABSOLUTE.test(specifier) || ENCODED_SEPARATOR.test(specifier) || CONTROL.test(specifier)) fail('PATH_ESCAPE');
  const slashed = specifier.replaceAll('\\', '/');
  if (slashed.startsWith('.')) {
    return {
      canonicalPath: joinRelative(posixDirname(importer.canonicalPath), slashed),
      locatorPath: joinRelative(posixDirname(importer.locatorPath), slashed),
      origin: importer.origin === 'project' ? 'relative-dependency' : importer.origin,
    };
  }
  const mapping = remappings.find((item) => slashed.startsWith(item.prefix));
  if (mapping) {
    const mapped = `${mapping.target}${slashed.slice(mapping.prefix.length)}`;
    return { canonicalPath: safeSegments(mapped).join('/'), locatorPath: safeSegments(mapped).join('/'), origin: 'foundry-remapping' };
  }
  const normalized = safeSegments(slashed).join('/');
  if (normalized.startsWith('lib/')) return { canonicalPath: normalized, locatorPath: normalized, origin: 'foundry-lib' };
  if (normalized.startsWith('node_modules/')) return { canonicalPath: normalized, locatorPath: normalized, origin: 'node_modules' };
  return { canonicalPath: normalized, locatorPath: `node_modules/${normalized}`, origin: 'node_modules' };
}

export function resolveVirtualProject({ sources, settings = {}, entrypoints, loadSource = null, limits = {} } = {}) {
  const applied = boundedLimits(limits);
  let normalized;
  try { normalized = normalizeSourceBundle(sources); }
  catch (error) { if (error?.code === 'source-path-collision') fail('AMBIGUOUS_IMPORT', { reason: 'source-path-collision' }); throw error; }
  const catalog = new Map(normalized.map((source) => [source.path, source.content]));
  const records = new Map();
  const folded = new Map();
  const virtualOwners = new Map();
  const remappings = normalizeProjectRemappings(settings.remappings ?? [], applied);
  let totalBytes = 0;

  function add(record) {
    const foldedPath = record.canonicalPath.toLowerCase();
    if (records.has(record.canonicalPath)) {
      if (records.get(record.canonicalPath).content !== record.content) fail('AMBIGUOUS_IMPORT', { source: record.canonicalPath });
      return records.get(record.canonicalPath);
    }
    if (folded.has(foldedPath)) fail('AMBIGUOUS_IMPORT', { reason: 'case-collision' });
    const virtualPath = record.virtualPath ?? record.locatorPath;
    if (virtualOwners.has(virtualPath) && virtualOwners.get(virtualPath) !== record.canonicalPath) fail('AMBIGUOUS_IMPORT', { reason: 'duplicate-virtual-source' });
    const fileBytes = bytes(record.content);
    if (fileBytes > applied.maxPerFileBytes) fail('LIMIT_EXCEEDED', { limit: 'file-bytes', source: record.canonicalPath });
    if (records.size + 1 > applied.maxFileCount) fail('LIMIT_EXCEEDED', { limit: 'file-count' });
    totalBytes += fileBytes;
    if (totalBytes > applied.maxProjectBytes) fail('LIMIT_EXCEEDED', { limit: 'project-bytes' });
    const stored = { ...record, content: String(record.content) };
    records.set(record.canonicalPath, stored); folded.set(foldedPath, record.canonicalPath); virtualOwners.set(virtualPath, record.canonicalPath);
    return stored;
  }

  function load(target, importer, specifier) {
    if (records.has(target.canonicalPath)) return records.get(target.canonicalPath);
    if (catalog.has(target.canonicalPath)) return add({ ...target, locatorPath: target.canonicalPath, content: catalog.get(target.canonicalPath), virtualPath: target.canonicalPath, origin: target.origin === 'node_modules' ? 'project' : target.origin });
    if (catalog.has(target.locatorPath)) return add({ ...target, content: catalog.get(target.locatorPath), virtualPath: target.locatorPath });
    if (typeof loadSource === 'function') {
      const loaded = loadSource({ ...target, importer: importer.canonicalPath, specifier, remainingProjectBytes: applied.maxProjectBytes - totalBytes });
      if (loaded) return add({ ...target, content: loaded.content ?? loaded, virtualPath: loaded.virtualPath ?? target.locatorPath });
    }
    fail('MISSING_IMPORT', { importer: importer.canonicalPath, specifier });
  }

  const seeds = (entrypoints?.length ? entrypoints : normalized.filter((source) => !dependencyPath(source.path)).map((source) => source.path)).map((value) => safeSegments(value).join('/')).sort(compareCodePoints);
  if (!seeds.length) fail('MISSING_IMPORT', { reason: 'no-project-entrypoint' });
  for (const seed of seeds) {
    if (!catalog.has(seed)) fail('MISSING_IMPORT', { source: seed });
    add({ canonicalPath: seed, locatorPath: seed, virtualPath: seed, origin: 'project', content: catalog.get(seed) });
  }

  const visited = new Set();
  function visit(record, depth) {
    if (depth > applied.maxImportDepth) fail('LIMIT_EXCEEDED', { limit: 'import-depth', source: record.canonicalPath });
    if (visited.has(record.canonicalPath)) return;
    visited.add(record.canonicalPath);
    for (const specifier of [...new Set(extractImports(record.content))].sort(compareCodePoints)) visit(load(importTarget(record, specifier, remappings, applied), record, specifier), depth + 1);
  }
  for (const seed of seeds) visit(records.get(seed), 0);

  const ordered = [...records.values()].sort((a, b) => compareCodePoints(a.canonicalPath, b.canonicalPath));
  return Object.freeze({
    sources: Object.fromEntries(ordered.map((record) => [record.canonicalPath, { content: record.content }])),
    settings: { ...settings, remappings: remappings.map((item) => item.text) },
    provenance: ordered.map(({ canonicalPath, origin }) => Object.freeze({ path: canonicalPath, origin })),
    limits: applied,
  });
}
