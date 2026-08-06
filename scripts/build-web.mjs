import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { buildWebV4Runtime } from './build-web-v4-runtime.mjs';
import { buildV4GrantLanding } from './lib/v4-grant-landing.mjs';

const root = process.cwd();
const outputDirectory = process.env.VEILFORGE_WEB_OUTPUT_DIR || 'dist';
if (!/^(?:dist|dist-preview-v4)$/u.test(outputDirectory)) throw new Error('VEILFORGE_WEB_OUTPUT_DIR must be dist or dist-preview-v4.');
const dist = path.join(root, outputDirectory);
const web = path.join(root, 'apps', 'web');

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === 'brand-lock.css') continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else fs.copyFileSync(from, to);
  }
}

function validAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(value ?? '');
}

fs.rmSync(dist, { recursive: true, force: true });
copyDirectory(web, dist);
copyDirectory(path.join(root, 'packages', 'analyzer', 'src'), path.join(dist, 'engine'));
copyDirectory(path.join(root, 'packages', 'proof', 'src'), path.join(dist, 'proof'));
copyDirectory(path.join(root, 'packages', 'proof', 'v4'), path.join(dist, 'proof-v4'));
copyDirectory(path.join(root, 'examples'), path.join(dist, 'examples'));

for (const name of ['index.html', 'executive-brief.html']) {
  const readerPath = path.join(dist, 'whitepaper', name);
  fs.writeFileSync(readerPath, fs.readFileSync(readerPath, 'utf8')
    .replaceAll('href="./reader.css"', 'href="/whitepaper/reader.css"')
    .replaceAll('src="./figures/', 'src="/whitepaper/figures/')
    .replaceAll('href="./VeilForge_', 'href="/whitepaper/VeilForge_')
    .replaceAll('href="./executive-brief.html"', 'href="/whitepaper/executive-brief"')
    .replaceAll('href="./"', 'href="/whitepaper/"'));
}

const proofPath = path.join(dist, 'proof', 'registry.js');
fs.writeFileSync(
  proofPath,
  fs.readFileSync(proofPath, 'utf8').replace("../../analyzer/src/keccak.js", "../engine/keccak.js"),
);

const sourceConfig = await import(pathToFileURL(path.join(web, 'config.js')).href);
const configuredAddress = process.env.VITE_REGISTRY_ADDRESS || process.env.VEILFORGE_REGISTRY_ADDRESS || sourceConfig.REGISTRY_ADDRESS;
const webV4Flag = process.env.VEILFORGE_WEB_V4_ENABLED;
const webV4Enabled = webV4Flag === undefined || webV4Flag === '' ? false : webV4Flag === 'true' || webV4Flag === '1' ? true : webV4Flag === 'false' || webV4Flag === '0' ? false : null;
if (!validAddress(configuredAddress)) throw new Error('Registry address is invalid. Set VITE_REGISTRY_ADDRESS to a valid EVM address.');
if (webV4Enabled === null) throw new Error('VEILFORGE_WEB_V4_ENABLED must be true or false.');
fs.writeFileSync(
  path.join(dist, 'config.js'),
  `export const REGISTRY_ADDRESS = '${configuredAddress}';\nexport const BUILD_VERSION = '3.2.2';\nexport const WEB_V4_ENABLED = ${webV4Enabled};\n`,
);

if (webV4Enabled) {
  const landingPath = path.join(dist, 'index.html');
  const landing = buildV4GrantLanding(fs.readFileSync(landingPath, 'utf8')
    .replace(/<meta name="description" content="[^"]+" \/>/u, '<meta name="description" content="VeilForge V4 Grant Candidate — local, deterministic Solidity privacy analysis with verified findings and Arc Testnet proof workflows." />')
    .replace(/<title>[^<]+<\/title>/u, '<title>VeilForge V4 Grant Candidate — Verified Findings</title>')
    .replace('<a href="./app/index.html#scanner">Privacy OS</a><a href="#workflow">Architecture</a><a href="https://docs.arc.network/arc/concepts/opt-in-privacy" target="_blank" rel="noreferrer">Arc APS docs</a>', '<a href="./app/index.html#scanner">V4 Scanner</a><a href="#workflow">Workflow</a><a href="https://github.com/CryptoDombili/veilforge/tree/main/docs" target="_blank" rel="noreferrer">Documentation</a>')
    .replace(/<span class="landing-version">[^<]+<\/span>/u, '<abbr class="landing-version" title="VeilForge V4 Grant Candidate" aria-label="VeilForge V4 Grant Candidate" tabindex="0">V4 GC</abbr>')
    .replace(/<a class="release-badge"[^>]*>[\s\S]*?<\/a>/u, '<a class="release-badge" href="#product" aria-label="VeilForge V4 Grant Candidate"><i></i> VeilForge V4 — Grant Candidate <span>→</span></a>')
    .replace(/<h1>[\s\S]*?<\/h1>/u, '<h1>Find privacy exposure.<br />Verify the evidence.<br /><em>Ship with confidence.</em></h1>')
    .replace(/<p class="flow-intro-copy">[\s\S]*?<\/p>/u, '<p class="flow-intro-copy">Run deterministic Solidity analysis locally, review source-backed findings, and prepare a verified Arc Testnet proof without uploading source code.</p>')
    .replace('Launch the Privacy OS', 'Launch V4 Scanner')
    .replace('<span>✓ No AI API</span><span>✓ Runs locally</span><span>✓ Privacy Genome</span><span>✓ Source-bound Passport</span>', '<span>✓ Local / private</span><span>✓ Deterministic</span><span>✓ Verified findings</span><span>✓ Arc Testnet proof</span>')
    .replace('VeilForge v3.2 privacy operating system showing Genome, Shadow and Passport states', 'VeilForge V4 verified findings workflow from local scan to Arc Testnet proof')
    .replace('VEILFORGE V3.2 ASCENSION SYSTEM', 'VEILFORGE V4 VERIFIED WORKFLOW')
    .replace('One mission.<br />Sixteen control surfaces.', 'One clear path.<br />Verified evidence end to end.')
    .replace('Move from Project X-Ray and Privacy Genome through Shadow simulation, Forge, Bytecode Truth, Arc rehearsal and release proof without losing the audit trail.', 'Configure, scan, review, verify, publish and export through one evidence-first workflow. Advanced technical detail stays available when you need it.'));
  fs.writeFileSync(landingPath, landing);

  const appPath = path.join(dist, 'app', 'index.html');
  const app = fs.readFileSync(appPath, 'utf8')
    .replace('<body class="app-page" data-ready="false">', '<body class="app-page v4-preview-pending" data-ready="false">');
  fs.writeFileSync(appPath, app);
}

for (const file of fs.readdirSync(path.join(dist, 'proof-v4')).filter((name) => name.endsWith('.js'))) {
  const target = path.join(dist, 'proof-v4', file);
  fs.writeFileSync(target, fs.readFileSync(target, 'utf8')
    .replaceAll('../../analyzer/src/', '../engine/')
    .replaceAll('../src/registry.js', '../proof/registry.js'));
}

for (const file of fs.readdirSync(path.join(dist, 'v4')).filter((name) => name.startsWith('proof-') && name.endsWith('.js'))) {
  const target = path.join(dist, 'v4', file);
  fs.writeFileSync(target, fs.readFileSync(target, 'utf8')
    .replaceAll('../../../packages/proof/src/registry.js', '../proof/registry.js')
    .replaceAll('../../../packages/proof/v4/network.js', '../proof-v4/network.js')
    .replaceAll('../../../packages/analyzer/src/keccak.js', '../engine/keccak.js'));
}

const manifest = {
  name: 'VeilForge Privacy Operating System',
  version: '3.2.2',
  output: 'static-es-modules',
  registryAddress: configuredAddress,
  generatedFiles: [],
};

function listFiles(directory) {
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(path.relative(directory, full).replaceAll(path.sep, '/'));
    }
  };
  walk(directory);
  return files;
}
manifest.generatedFiles = listFiles(dist);
fs.writeFileSync(path.join(dist, 'build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

buildWebV4Runtime({ root, dist });

for (const required of ['index.html', 'app.js', 'styles.css', 'engine/index.js', 'proof/registry.js', 'proof-v4/network.js', 'v4/proof-adapter.js', 'config.js', 'whitepaper/VeilForge_V4_Whitepaper.pdf', 'whitepaper/VeilForge_V4_Executive_Brief.pdf', 'whitepaper/figures/veilforge-architecture.svg', 'whitepaper/figures/configure-to-export-workflow.svg', 'whitepaper/figures/arc-testnet-proof-lifecycle.svg', 'whitepaper/figures/open-core-sustainability-loop.svg', 'whitepaper/figures/mainnet-staged-rollout.svg']) {
  if (!fs.existsSync(path.join(dist, required))) throw new Error(`Build output is missing ${required}.`);
}

console.log(`VeilForge web build created ${manifest.generatedFiles.length + 1} files in dist/.`);
