import { TextDecoder } from 'node:util';
import { keccakHex } from '../../keccak.js';
import { SourceNormalizationError } from './errors.js';

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const ABSOLUTE_PATH = /^(?:\/|[a-zA-Z]:[\\/]|\\\\|\/\/)/;

export function compareCodePoints(left, right) {
  const a = Array.from(left, (value) => value.codePointAt(0));
  const b = Array.from(right, (value) => value.codePointAt(0));
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
}

export function canonicalJson(value) {
  if (value === undefined) throw new TypeError('Canonical JSON forbids undefined values.');
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Canonical JSON forbids non-finite numbers.');
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort(compareCodePoints);
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function domainHash(domain, value) {
  return keccakHex(`${domain}\0${canonicalJson(value)}`);
}

export function normalizeSourcePath(input) {
  const original = String(input ?? '');
  if (!original || original.includes('\0')) {
    throw new SourceNormalizationError('invalid-source-path', 'Source paths must be non-empty and contain no NUL bytes.', { path: original });
  }
  if (ABSOLUTE_PATH.test(original)) {
    throw new SourceNormalizationError('absolute-source-path', `Absolute source path rejected: ${original}`, { path: original });
  }

  const slashed = original.replaceAll('\\', '/');
  const segments = [];
  for (const segment of slashed.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      throw new SourceNormalizationError('path-traversal', `Path traversal rejected: ${original}`, { path: original });
    }
    segments.push(segment.normalize('NFC'));
  }
  const normalized = segments.join('/');
  if (!normalized) throw new SourceNormalizationError('invalid-source-path', `Source path normalizes to an empty path: ${original}`, { path: original });
  return normalized;
}

export function normalizeSourceContent(input) {
  let text;
  try {
    text = Buffer.isBuffer(input) || input instanceof Uint8Array ? utf8Decoder.decode(input) : String(input ?? '');
  } catch (error) {
    throw new SourceNormalizationError('invalid-utf8', 'Source content is not valid UTF-8.', { cause: error.message });
  }
  if (text.startsWith('\uFEFF')) text = text.slice(1);
  return text.replace(/\r\n?/g, '\n');
}

function sourceEntries(bundle) {
  if (Array.isArray(bundle)) return bundle.map((source) => [source.path, source.content]);
  if (bundle && typeof bundle === 'object') return Object.entries(bundle).map(([sourcePath, source]) => [sourcePath, source?.content ?? source]);
  throw new SourceNormalizationError('invalid-source-bundle', 'Sources must be an object or an array of { path, content }.');
}

export function normalizeSourceBundle(bundle) {
  const seen = new Map();
  const normalized = [];
  for (const [declaredPath, content] of sourceEntries(bundle)) {
    const sourcePath = normalizeSourcePath(declaredPath);
    const folded = sourcePath.toLowerCase();
    if (seen.has(sourcePath) || seen.has(folded)) {
      throw new SourceNormalizationError('source-path-collision', `Normalized source path collision: ${declaredPath}`, {
        path: sourcePath,
        collidesWith: seen.get(sourcePath) ?? seen.get(folded),
      });
    }
    seen.set(sourcePath, sourcePath);
    seen.set(folded, sourcePath);
    normalized.push({ path: sourcePath, content: normalizeSourceContent(content) });
  }
  normalized.sort((left, right) => compareCodePoints(left.path, right.path));
  return normalized;
}

function normalizeRemapping(remapping) {
  const value = typeof remapping === 'string' ? remapping : `${remapping?.prefix ?? ''}=${remapping?.target ?? ''}`;
  const separator = value.indexOf('=');
  if (separator <= 0 || separator === value.length - 1) {
    throw new SourceNormalizationError('invalid-remapping', `Invalid Solidity remapping: ${value}`);
  }
  const prefix = value.slice(0, separator).replaceAll('\\', '/').normalize('NFC');
  const rawTarget = value.slice(separator + 1);
  const trailingSlash = /[\\/]$/.test(rawTarget);
  const target = normalizeSourcePath(rawTarget) + (trailingSlash ? '/' : '');
  if (prefix.startsWith('/') || /^[a-zA-Z]:/.test(prefix) || prefix.includes('..')) {
    throw new SourceNormalizationError('invalid-remapping', `Invalid Solidity remapping prefix: ${prefix}`);
  }
  return `${prefix}=${target}`;
}

export function normalizeCompilerSettings(settings = {}) {
  const optimizer = settings.optimizer ?? {};
  const remappings = [...(settings.remappings ?? [])].map(normalizeRemapping).sort(compareCodePoints);
  const libraries = {};
  for (const sourcePath of Object.keys(settings.libraries ?? {}).map(normalizeSourcePath).sort(compareCodePoints)) {
    const originalKey = Object.keys(settings.libraries).find((key) => normalizeSourcePath(key) === sourcePath);
    libraries[sourcePath] = Object.fromEntries(Object.entries(settings.libraries[originalKey]).sort(([a], [b]) => compareCodePoints(a, b)));
  }
  return {
    optimizer: { enabled: Boolean(optimizer.enabled), runs: Number.isInteger(optimizer.runs) ? optimizer.runs : 200 },
    evmVersion: settings.evmVersion ?? 'shanghai',
    remappings,
    libraries,
    metadata: { bytecodeHash: settings.metadata?.bytecodeHash ?? 'none', appendCBOR: settings.metadata?.appendCBOR ?? false },
    outputSelection: {
      '*': {
        '': ['ast'],
        '*': ['abi', 'storageLayout', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.methodIdentifiers'],
      },
    },
  };
}

export function buildStandardJsonInput({ sources, settings = {} }) {
  const normalizedSources = normalizeSourceBundle(sources);
  const sourceObject = {};
  for (const source of normalizedSources) sourceObject[source.path] = { content: source.content };
  const input = { language: 'Solidity', sources: sourceObject, settings: normalizeCompilerSettings(settings) };
  return { input, sources: normalizedSources, canonicalJson: canonicalJson(input) };
}

export function canonicalSourceHash(sources) {
  const sourceObject = Object.fromEntries(normalizeSourceBundle(sources).map((source) => [source.path, source.content]));
  return domainHash('veilforge:v4:canonical-source:1', sourceObject);
}

export function compilerInputHash(input, compilerVersion = '0.8.24') {
  return domainHash('veilforge:v4:compiler-input:1', { compilerVersion, input });
}
