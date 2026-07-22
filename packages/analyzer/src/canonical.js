import { keccakHex } from './keccak.js';

export function normalizeText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n');
}

export function normalizePath(value) {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');
}

export function compactWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function splitIdentifier(value) {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

export function canonicalSourceHash(files) {
  const payload = [...files]
    .map((file) => ({ path: normalizePath(file.path), content: normalizeText(file.content) }))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => `${file.path}\0${file.content}\u001e`)
    .join('');
  return keccakHex(payload);
}

export function canonicalReportHash(report) {
  const { reportHash: _ignored, ...stable } = report;
  return keccakHex(canonicalize(stable));
}

export function stableFingerprint(parts) {
  return keccakHex(parts.map((part) => compactWhitespace(part)).join('|'));
}

export function excerpt(source, startLine, endLine = startLine) {
  const lines = normalizeText(source).split('\n');
  return lines
    .slice(Math.max(0, startLine - 1), Math.min(lines.length, endLine))
    .join('\n')
    .trim();
}

export function lineNumberAtOffset(source, offset) {
  return normalizeText(source.slice(0, Math.max(0, offset))).split('\n').length;
}
