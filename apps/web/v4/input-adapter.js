import { canonicalJson, deepFreeze } from './canonical.js';
import { webV4Error } from './errors.js';
import { normalizeWebV4Limits } from './runtime/limits.js';

const encoder = new TextEncoder();

export function canonicalSourcePath(value) {
  const path = String(value ?? '').replaceAll('\\', '/');
  if (!path || path.includes('\0') || /^(?:\/|[A-Za-z]:|[a-z][a-z0-9+.-]*:)/i.test(path)) throw webV4Error('WEB_V4_INPUT_INVALID', 'Source path must be project-relative.');
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw webV4Error('WEB_V4_INPUT_INVALID', 'Source path traversal is not allowed.');
  return parts.join('/');
}

async function fileBytes(file) {
  if (file?.isSymbolicLink === true || file?.symlink === true || file?.type === 'inode/symlink') throw webV4Error('WEB_V4_INPUT_INVALID', 'File aliases and symbolic links are not accepted.');
  if (typeof file?.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  if (typeof file?.content === 'string') return encoder.encode(file.content);
  if (typeof file?.text === 'function') return encoder.encode(await file.text());
  throw webV4Error('WEB_V4_INPUT_INVALID', 'Browser file content is unavailable.');
}

function decodeSource(bytes) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw webV4Error('WEB_V4_INPUT_INVALID', 'Source file is not valid UTF-8.'); }
  if (text.includes('\0')) throw webV4Error('WEB_V4_INPUT_INVALID', 'Binary or NUL-containing source is not accepted.');
  return text.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n');
}

function plainClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(canonicalJson(value));
}

export async function browserFilesToScanInput(files, options = {}) {
  if (!Array.isArray(files) || !files.length) throw webV4Error('WEB_V4_INPUT_INVALID', 'At least one browser file is required.');
  const limits = normalizeWebV4Limits(options.limits);
  if (files.length > limits.maxFileCount) throw webV4Error('WEB_V4_INPUT_LIMIT', 'Browser file count exceeds the safe limit.', { limit: limits.maxFileCount });
  const entries = [];
  const folded = new Map();
  let projectBytes = 0;
  for (const file of files) {
    const path = canonicalSourcePath(file.webkitRelativePath || file.relativePath || file.path || file.name);
    const key = path.toLowerCase();
    if (folded.has(key)) throw webV4Error('WEB_V4_INPUT_INVALID', folded.get(key) === path ? 'Duplicate source path.' : 'Case-folding source path collision.');
    const bytes = await fileBytes(file);
    if (bytes.byteLength > limits.maxPerFileBytes) throw webV4Error('WEB_V4_INPUT_LIMIT', 'A source file exceeds the safe byte limit.', { path, limit: limits.maxPerFileBytes });
    projectBytes += bytes.byteLength;
    if (projectBytes > limits.maxProjectBytes) throw webV4Error('WEB_V4_INPUT_LIMIT', 'Project sources exceed the safe byte limit.', { limit: limits.maxProjectBytes });
    folded.set(key, path);
    entries.push([path, { content: decodeSource(bytes) }]);
  }
  entries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  const projectId = String(options.projectId ?? '').trim();
  if (!projectId || projectId.length > 128) throw webV4Error('WEB_V4_INPUT_INVALID', 'A stable projectId is required.');
  const domains = [...new Set(options.domains ?? ['arc-payments'])].sort();
  const result = {
    projectId,
    projectName: String(options.projectName ?? projectId).slice(0, 128),
    sources: Object.fromEntries(entries),
    domains,
    compiler: { version: options.compilerVersion ?? '0.8.24' },
    budgets: plainClone(options.analysisLimits ?? {}),
  };
  if (options.policy !== undefined) result.policy = plainClone(options.policy);
  if (options.taxonomy !== undefined) result.taxonomy = plainClone(options.taxonomy);
  return deepFreeze(result);
}
