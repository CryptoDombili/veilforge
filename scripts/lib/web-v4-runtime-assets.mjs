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

function browserModulePath(importer, specifier) {
  if (typeof specifier !== 'string' || !/^\.\.?(?:\/|$)/u.test(specifier)) throw new Error('V4 runtime module specifier must be deployment-relative.');
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(`/${importer}`), specifier)).replace(/^\//u, '');
  if (resolved.startsWith('../') || path.posix.isAbsolute(resolved)) throw new Error('V4 runtime module path escapes the production artifact.');
  return resolved;
}

function requireImport(source, importer, specifier, expected) {
  if (!source.includes(specifier)) throw new Error(`V4 runtime import is missing from ${importer}.`);
  if (browserModulePath(importer, specifier) !== expected) throw new Error(`V4 runtime import path is invalid for ${expected}.`);
}

export function verifyWebV4RuntimeAssets(output) {
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
  const manifest = JSON.parse(read('v4/veilforge-v4-scanner.worker.manifest.json'));
  const generated = new Set(manifest.generatedFiles);
  for (const relative of WEB_V4_RUNTIME_ASSET_PATHS.filter((item) => !item.endsWith('.manifest.json'))) {
    if (!generated.has(relative.replace(/^v4\//u, ''))) throw new Error(`V4 worker manifest is missing ${relative}.`);
  }
  if (manifest.buildMode !== 'browser-module-worker' || manifest.compilerVersion !== '0.8.24') throw new Error('V4 worker manifest runtime identity is invalid.');
  if (fs.statSync(path.join(root, 'v4/soljson-v0.8.24.js')).size < 1_000_000) throw new Error('Pinned V4 compiler asset is unexpectedly small.');
  return Object.freeze({ workerAssetPaths: true, compilerAssets: true, requiredAssets: WEB_V4_RUNTIME_ASSET_PATHS });
}
