import path from 'node:path';
import { compareCodePoints, normalizeSourceBundle, normalizeSourcePath } from './standard-json.js';

const IMPORT_PATTERN = /\bimport\s+(?:(?:[^;"']+?\s+from\s+)?["']([^"']+)["'])\s*;/g;

function withoutComments(content) {
  let state = 'code';
  let quote = null;
  let result = '';
  for (let index = 0; index < content.length; index += 1) {
    const current = content[index];
    const next = content[index + 1];
    if (state === 'line-comment') {
      if (current === '\n') { state = 'code'; result += '\n'; } else result += ' ';
    } else if (state === 'block-comment') {
      if (current === '*' && next === '/') { state = 'code'; result += '  '; index += 1; }
      else result += current === '\n' ? '\n' : ' ';
    } else if (state === 'string') {
      result += current;
      if (current === '\\') { result += next ?? ''; index += 1; }
      else if (current === quote) { state = 'code'; quote = null; }
    } else if (current === '/' && next === '/') {
      state = 'line-comment'; result += '  '; index += 1;
    } else if (current === '/' && next === '*') {
      state = 'block-comment'; result += '  '; index += 1;
    } else {
      result += current;
      if (current === '"' || current === "'") { state = 'string'; quote = current; }
    }
  }
  return result;
}

export function extractImports(content) {
  const imports = [];
  for (const match of withoutComments(content).matchAll(IMPORT_PATTERN)) imports.push(match[1]);
  return imports;
}

function remappingEntries(remappings = []) {
  return remappings.map((value) => {
    const separator = value.indexOf('=');
    return { prefix: value.slice(0, separator), target: value.slice(separator + 1) };
  }).sort((left, right) => right.prefix.length - left.prefix.length || compareCodePoints(left.prefix, right.prefix));
}

export function resolveImportPath(importerPath, importPath, remappings = []) {
  const slashed = String(importPath).replaceAll('\\', '/');
  if (slashed.startsWith('.')) {
    return normalizeSourcePath(path.posix.join(path.posix.dirname(importerPath), slashed));
  }
  const mapping = remappingEntries(remappings).find(({ prefix }) => slashed.startsWith(prefix));
  if (mapping) return normalizeSourcePath(`${mapping.target}${slashed.slice(mapping.prefix.length)}`);
  return normalizeSourcePath(slashed);
}

export function buildImportGraph(sources, remappings = []) {
  const normalized = normalizeSourceBundle(sources);
  const available = new Set(normalized.map((source) => source.path));
  const diagnostics = [];
  const edges = [];
  for (const source of normalized) {
    for (const specifier of extractImports(source.content)) {
      const resolvedPath = resolveImportPath(source.path, specifier, remappings);
      const resolved = available.has(resolvedPath);
      edges.push({ importer: source.path, specifier, resolvedPath, resolved });
      if (!resolved) {
        diagnostics.push({
          severity: 'error', errorCode: 'import-not-found', type: 'ImportResolutionError', component: 'veilforge-frontend',
          message: `Import not found: ${specifier}`, formattedMessage: `${source.path}: Import not found: ${specifier}`,
          sourcePath: source.path, byteStart: Buffer.byteLength(source.content.slice(0, source.content.indexOf(specifier)), 'utf8'),
          byteLength: Buffer.byteLength(specifier, 'utf8'), line: null, column: null,
        });
      }
    }
  }
  edges.sort((left, right) => compareCodePoints(`${left.importer}\0${left.specifier}`, `${right.importer}\0${right.specifier}`));

  const adjacency = new Map(normalized.map((source) => [source.path, []]));
  for (const edge of edges) if (edge.resolved) adjacency.get(edge.importer).push(edge.resolvedPath);
  const cycles = [];
  const visited = new Set();
  const active = [];
  const activeSet = new Set();
  function visit(node) {
    if (visited.has(node)) return;
    if (activeSet.has(node)) {
      const start = active.indexOf(node);
      cycles.push([...active.slice(start), node]);
      return;
    }
    active.push(node);
    activeSet.add(node);
    for (const target of [...adjacency.get(node)].sort(compareCodePoints)) visit(target);
    active.pop();
    activeSet.delete(node);
    visited.add(node);
  }
  for (const source of normalized) visit(source.path);
  return { nodes: normalized.map((source) => source.path), edges, cycles, diagnostics };
}
