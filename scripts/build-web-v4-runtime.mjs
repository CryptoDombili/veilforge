import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_COMPILER_DIGEST = 'fb59b825b7d57f9de89cd9de2415b12aab1fcc7eb2573fd2bf5c9b969eacf4d9';
const COMPILER_VERSION = '0.8.24';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const slash = (value) => value.replaceAll(path.sep, '/');

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const from = path.join(source, entry.name); const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to); else fs.copyFileSync(from, to);
  }
}

function replaceExact(file, search, replacement) {
  const current = fs.readFileSync(file, 'utf8');
  if (!current.includes(search)) throw new Error(`Browser runtime transform target missing: ${slash(file)}`);
  fs.writeFileSync(file, current.replace(search, replacement));
}

function generatedFiles(root) {
  const output = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute); else output.push(slash(path.relative(root, absolute)));
    }
  };
  walk(root);
  return output;
}

export function buildWebV4Runtime({ root = process.cwd(), dist = path.join(root, 'dist') } = {}) {
  const output = path.join(dist, 'v4');
  const assets = path.join(output, 'runtime', 'browser-runtime-assets');
  const engine = path.join(assets, 'engine');
  const compilerSource = path.join(root, 'node_modules', 'solc', 'soljson.js');
  const rawCompiler = fs.readFileSync(compilerSource);
  const compilerDigest = digest(rawCompiler);
  if (compilerDigest !== EXPECTED_COMPILER_DIGEST) throw new Error(`Pinned solc ${COMPILER_VERSION} digest mismatch.`);

  fs.rmSync(assets, { recursive: true, force: true });
  copyDirectory(path.join(root, 'packages', 'analyzer', 'src'), engine);

  const adapters = '../../../../browser/';
  const rewrites = [
    ['v4/report/report-hash.js', "from'node:crypto'", `from'${adapters}node-crypto.js'`],
    ['v4/report/redaction.js', "from'node:crypto'", `from'${adapters}node-crypto.js'`],
    ['v4/export/export-manifest.js', "from'node:crypto'", `from'${adapters}node-crypto.js'`],
    ['v4/orchestration/scan-context.js', "from'node:crypto'", `from'${adapters}node-crypto.js'`],
    ['v4/report/report-builder.js', "from'node:fs'", `from'${adapters}node-fs.js'`],
    ['v4/frontend/import-graph.js', "from 'node:path'", `from '${adapters}node-path.js'`],
    ['v4/frontend/standard-json.js', "from 'node:util'", `from '${adapters}node-util.js'`],
    ['v4/orchestration/scan-project.js', "from'node:perf_hooks'", `from'${adapters}node-performance.js'`],
  ];
  for (const [relative, search, replacement] of rewrites) replaceExact(path.join(engine, relative), search, replacement);
  fs.writeFileSync(path.join(engine, 'v4', 'frontend', 'compiler-provider.js'), `import { createBrowserCompiler } from '${adapters}solc-compiler.js';\nexport const SUPPORTED_SOLC_VERSION = '${COMPILER_VERSION}';\nexport function compilerVersionInfo(compiler) { const longVersion=String(compiler.version()); return {version:longVersion.split('+')[0],longVersion}; }\nexport function getCompiler({requestedVersion=SUPPORTED_SOLC_VERSION,compiler=null}={}) { if(requestedVersion!==SUPPORTED_SOLC_VERSION) throw new Error('Unsupported compiler version.'); const instance=compiler??createBrowserCompiler(); const info=compilerVersionInfo(instance); if(info.version!==SUPPORTED_SOLC_VERSION) throw new Error('Compiler version mismatch.'); return {compiler:instance,...info}; }\nexport function compileStandardJson(input,options={}) { const provider=getCompiler(options); const rawOutput=provider.compiler.compile(typeof input==='string'?input:JSON.stringify(input)); return {...provider,output:JSON.parse(rawOutput),rawOutput}; }\n`);

  let soljson = rawCompiler.toString('utf8');
  soljson = soljson.replace('var Module = Module || {};', 'var Module = { print() {}, printErr() {} };');
  soljson = soljson.replace('var ENVIRONMENT_IS_WEB = typeof window == "object";\nvar ENVIRONMENT_IS_WORKER = typeof importScripts == "function";\nvar ENVIRONMENT_IS_NODE = typeof process == "object" && typeof process.versions == "object" && typeof process.versions.node == "string";', 'var ENVIRONMENT_IS_WEB = false;\nvar ENVIRONMENT_IS_WORKER = true;\nvar ENVIRONMENT_IS_NODE = false;');
  const networkBranch = /else if \(ENVIRONMENT_IS_WEB \|\| ENVIRONMENT_IS_WORKER\) \{[\s\S]*?\n\}\nelse \{ \}/u;
  if (!networkBranch.test(soljson)) throw new Error('Pinned solc browser environment block was not found.');
  soljson = soljson.replace(networkBranch, "else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) { scriptDirectory = ''; setWindowTitle = () => {}; }\nelse { }");
  soljson += '\nexport default Module;\n';
  const compilerOutput = path.join(output, `soljson-v${COMPILER_VERSION}.js`);
  fs.writeFileSync(compilerOutput, soljson);

  const releaseText = fs.readFileSync(path.join(root, 'RELEASE_MANIFEST.sha256'), 'utf8').replace(/\r\n?/gu, '\n');
  const releaseDigest = `sha256:${digest(JSON.stringify(releaseText))}`;
  const taxonomy = fs.readFileSync(path.join(root, 'docs', 'grant-candidate', 'financial-data-taxonomy.yaml'), 'utf8').replace(/\r\n?/gu, '\n');
  fs.writeFileSync(path.join(output, 'runtime', 'browser', 'runtime-config.js'), `export const COMPILER_VERSION=${JSON.stringify(COMPILER_VERSION)};\nexport const COMPILER_DIGEST=${JSON.stringify(`sha256:${compilerDigest}`)};\nexport const RELEASE_MANIFEST_DIGEST=${JSON.stringify(releaseDigest)};\nexport const TAXONOMY=${JSON.stringify(taxonomy)};\n`);
  const worker = path.join(output, 'veilforge-v4-scanner.worker.js');
  fs.writeFileSync(worker, "import './runtime/worker-entry.js';\n");

  const manifestPath = path.join(output, 'veilforge-v4-scanner.worker.manifest.json');
  const files = generatedFiles(output).filter((file) => !file.endsWith('.manifest.json'));
  const workerDigest = digest(files.map((file) => `${file}\0${digest(fs.readFileSync(path.join(output, file)))}`).join('\n'));
  const manifest = {
    runtimeVersion: '5.1.0', compilerVersion: COMPILER_VERSION,
    compilerDigest: `sha256:${compilerDigest}`, workerDigest: `sha256:${workerDigest}`,
    buildMode: 'browser-module-worker', supportedReportSchema: '4.1.0',
    hashPayloadVersion: 'veilforge.report.hash.v2', generatedFiles: files,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = buildWebV4Runtime();
  console.log(`VeilForge V4 browser runtime created ${manifest.generatedFiles.length + 1} files.`);
}
