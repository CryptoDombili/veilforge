import fs from 'node:fs';
import path from 'node:path';

export const WEB_V4_RUNTIME_ASSET_PATHS = Object.freeze([
  'v4/veilforge-v4-scanner.worker.js',
  'v4/veilforge-v4-scanner.worker.manifest.json',
  'v4/runtime/worker-entry.js',
  'v4/runtime/worker-runtime.js',
  'v4/runtime/worker-client.js',
  'v4/runtime/browser-scanner-entry.js',
  'v4/runtime/browser/solc-compiler.js',
  'v4/runtime/browser/runtime-config.js',
  'v4/runtime/browser-runtime-assets/engine/v4/orchestration/index.js',
  'v4/soljson-v0.8.24.js',
]);

const IMPORT_PATTERNS = Object.freeze([
  /\bimport\s*\(\s*(['"])(\.\.?\/[^'"]+)\1\s*\)/gu,
  /\bimport\s*(?:[^'";]*?from\s*)?(['"])(\.\.?\/[^'"]+)\1/gu,
  /\bexport\s*(?:\*\s*(?:as\s+[A-Za-z_$][\w$]*\s*)?|\{[^}]*\})\s*from\s*(['"])(\.\.?\/[^'"]+)\1/gu,
]);

function browserModulePath(importer, specifier) {
  if (typeof specifier !== 'string' || !/^\.\.?(?:\/|$)/u.test(specifier)) throw new Error(`V4 runtime module specifier must be same-origin and deployment-relative: ${specifier}.`);
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(`/${importer}`), specifier)).replace(/^\//u, '');
  if (resolved.startsWith('../') || path.posix.isAbsolute(resolved)) throw new Error('V4 runtime module path escapes the production artifact.');
  return resolved;
}

function requireImport(source, importer, specifier, expected) {
  if (!source.includes(specifier)) throw new Error(`V4 runtime import is missing from ${importer}.`);
  if (browserModulePath(importer, specifier) !== expected) throw new Error(`V4 runtime import path is invalid for ${expected}.`);
}

function moduleSpecifiers(source) {
  const specifiers = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) specifiers.add(match[2]);
  }
  return [...specifiers].sort();
}

function verifyModuleGraph(root, entrypoint) {
  const visited = new Set();
  const pending = [entrypoint];
  let usesWebAssembly = false;
  while (pending.length) {
    const relative = pending.pop();
    if (visited.has(relative)) continue;
    if (!relative.endsWith('.js')) throw new Error(`V4 browser module has a non-JavaScript MIME path: ${relative}.`);
    const absolute = path.resolve(root, relative);
    if (!(absolute.startsWith(`${root}${path.sep}`) && fs.statSync(absolute, { throwIfNoEntry: false })?.isFile())) throw new Error(`V4 browser module is missing from the production artifact: ${relative}.`);
    const source = fs.readFileSync(absolute, 'utf8');
    if (/\beval\s*\(|\bnew\s+Function\s*\(|\bimportScripts\s*\(/u.test(source)) throw new Error(`V4 browser module requires an unsafe script execution primitive: ${relative}.`);
    if (!relative.endsWith('/soljson-v0.8.24.js') && /\b(?:from\s*|import\s*\(\s*|import\s+)(['"])(?!\.\.?\/)(?:blob:|data:|https?:|file:|node:|[A-Za-z@])/u.test(source)) throw new Error(`V4 browser module has a non-relative dependency: ${relative}.`);
    if (!relative.endsWith('/soljson-v0.8.24.js')) {
      const dynamicImportCount = source.match(/\bimport\s*\(/gu)?.length ?? 0;
      IMPORT_PATTERNS[0].lastIndex = 0;
      const staticDynamicImportCount = [...source.matchAll(IMPORT_PATTERNS[0])].length;
      if (dynamicImportCount !== staticDynamicImportCount) throw new Error(`V4 browser module has a generated or non-literal module URL: ${relative}.`);
    }
    if (/\bWebAssembly\.(?:Module|Instance|instantiate|instantiateStreaming)\b/u.test(source)) usesWebAssembly = true;
    visited.add(relative);
    for (const specifier of moduleSpecifiers(source)) {
      pending.push(browserModulePath(relative, specifier));
    }
  }
  return Object.freeze({ modules: Object.freeze([...visited].sort()), usesWebAssembly });
}

function cspDirective(csp, name) {
  const match = String(csp ?? '').match(new RegExp(`(?:^|;)\\s*${name}\\s+([^;]+)`, 'u'));
  return match ? match[1].trim().split(/\s+/u) : [];
}

export function assertWebV4ProductionCsp(csp) {
  const scriptSources = cspDirective(csp, 'script-src');
  const workerSources = cspDirective(csp, 'worker-src');
  if (!scriptSources.includes("'self'") || !scriptSources.includes("'wasm-unsafe-eval'") || scriptSources.includes("'unsafe-eval'") || scriptSources.includes('*')) throw new Error('Production script-src is not the narrow CSP required by the static V4 compiler graph.');
  if (!workerSources.includes("'self'") || workerSources.includes('*') || workerSources.includes('data:')) throw new Error('Production worker-src is not strict and same-origin.');
  return Object.freeze({ effectiveDirective: 'script-src', compilerBlockedUri: 'wasm-eval', wasmCompilationAllowed: true });
}

export function verifyWebV4RuntimeAssets(output, { csp = null } = {}) {
  const root = path.resolve(output);
  for (const relative of WEB_V4_RUNTIME_ASSET_PATHS) {
    const absolute = path.resolve(root, relative);
    if (path.dirname(absolute) === root || absolute.startsWith(`${root}${path.sep}`)) {
      if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isFile()) throw new Error(`Arc Mainnet production artifact is missing ${relative}.`);
    } else throw new Error('V4 runtime asset path escapes the production artifact.');
  }
  const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
  requireImport(read('v4/runtime/worker-client.js'), 'v4/runtime/worker-client.js', '../veilforge-v4-scanner.worker.js', 'v4/veilforge-v4-scanner.worker.js');
  requireImport(read('v4/veilforge-v4-scanner.worker.js'), 'v4/veilforge-v4-scanner.worker.js', './runtime/worker-entry.js', 'v4/runtime/worker-entry.js');
  requireImport(read('v4/runtime/browser/solc-compiler.js'), 'v4/runtime/browser/solc-compiler.js', '../../soljson-v0.8.24.js', 'v4/soljson-v0.8.24.js');
  requireImport(read('v4/runtime/browser-scanner-entry.js'), 'v4/runtime/browser-scanner-entry.js', './browser-runtime-assets/engine/v4/orchestration/index.js', 'v4/runtime/browser-runtime-assets/engine/v4/orchestration/index.js');
  const graph = verifyModuleGraph(root, 'v4/veilforge-v4-scanner.worker.js');
  for (const required of ['v4/runtime/browser-runtime-assets/engine/v4/orchestration/index.js', 'v4/runtime/browser/solc-compiler.js', 'v4/soljson-v0.8.24.js']) {
    if (!graph.modules.includes(required)) throw new Error(`V4 worker dependency graph does not reach ${required}.`);
  }
  if (!graph.usesWebAssembly) throw new Error('Pinned V4 compiler no longer exposes its expected WebAssembly boundary.');
  if (csp !== null) assertWebV4ProductionCsp(csp);
  const manifest = JSON.parse(read('v4/veilforge-v4-scanner.worker.manifest.json'));
  const generated = new Set(manifest.generatedFiles);
  for (const relative of graph.modules) {
    if (!generated.has(relative.replace(/^v4\//u, ''))) throw new Error(`V4 worker manifest is missing reachable module ${relative}.`);
  }
  for (const relative of WEB_V4_RUNTIME_ASSET_PATHS.filter((item) => !item.endsWith('.manifest.json'))) {
    if (!generated.has(relative.replace(/^v4\//u, ''))) throw new Error(`V4 worker manifest is missing ${relative}.`);
  }
  if (manifest.buildMode !== 'browser-module-worker' || manifest.compilerVersion !== '0.8.24') throw new Error('V4 worker manifest runtime identity is invalid.');
  if (fs.statSync(path.join(root, 'v4/soljson-v0.8.24.js')).size < 1_000_000) throw new Error('Pinned V4 compiler asset is unexpectedly small.');
  return Object.freeze({ workerAssetPaths: true, compilerAssets: true, cspCompatible: csp !== null, reachableModuleCount: graph.modules.length, reachableModules: graph.modules, requiredAssets: WEB_V4_RUNTIME_ASSET_PATHS });
}
