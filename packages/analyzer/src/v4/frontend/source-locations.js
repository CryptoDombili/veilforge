import { normalizeSourceContent } from './standard-json.js';

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function byteOffsetToLineColumn(content, byteOffset) {
  const normalized = normalizeSourceContent(content);
  const bytes = Buffer.from(normalized, 'utf8');
  const offset = clamp(Number(byteOffset) || 0, 0, bytes.length);
  const prefix = bytes.subarray(0, offset).toString('utf8');
  const lines = prefix.split('\n');
  return { line: lines.length, column: Array.from(lines.at(-1)).length + 1 };
}

export function parseAstSourceRange(src) {
  const [start, length, sourceId] = String(src ?? '').split(':').map(Number);
  if (![start, length, sourceId].every(Number.isInteger) || start < 0 || length < 0) return null;
  return { byteStart: start, byteLength: length, sourceId };
}

export function resolveSourceLocation(src, sourceById) {
  const range = typeof src === 'string' ? parseAstSourceRange(src) : src;
  if (!range) return null;
  const source = sourceById instanceof Map ? sourceById.get(range.sourceId) : sourceById?.[range.sourceId];
  if (!source) return null;
  const byteEnd = range.byteStart + range.byteLength;
  const start = byteOffsetToLineColumn(source.content, range.byteStart);
  const end = byteOffsetToLineColumn(source.content, byteEnd);
  return {
    sourcePath: source.path,
    sourceId: range.sourceId,
    byteStart: range.byteStart,
    byteLength: range.byteLength,
    byteEnd,
    lineStart: start.line,
    columnStart: start.column,
    lineEnd: end.line,
    columnEnd: end.column,
  };
}
