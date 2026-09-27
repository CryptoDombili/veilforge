import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { buildWebV4Runtime } from './build-web-v4-runtime.mjs';
import { buildV4GrantLanding } from './lib/v4-grant-landing.mjs';
import { assertMainnetDeploymentConfig, assertMainnetProductionConfig } from './lib/mainnet-read-activation.mjs';
import { V4_PRODUCT_NAME, V4_PRODUCT_VERSION, V4_REPORT_VERSION } from '../apps/web/v4/version.js';

const root = process.cwd();
const outputDirectory = process.env.VEILFORGE_WEB_OUTPUT_DIR || 'dist';
if (!/^(?:dist|dist-grant-release|dist-preview-v4|dist-mainnet-production)$/u.test(outputDirectory)) throw new Error('VEILFORGE_WEB_OUTPUT_DIR must be dist, dist-grant-release, dist-preview-v4, or dist-mainnet-production.');
const dist = path.join(root, outputDirectory);
const web = path.join(root, 'apps', 'web');

function resolveSourceCommit() {
  const sourceCommit = process.env.VEILFORGE_TRUSTED_SOURCE_COMMIT;
  const sourceTreeDigest = process.env.VEILFORGE_TRUSTED_SOURCE_TREE_DIGEST;
  const packageLockDigest = process.env.VEILFORGE_TRUSTED_PACKAGE_LOCK_DIGEST;
  if (process.env.VEILFORGE_PRODUCTION_SNAPSHOT !== 'git-archive-v1'
    || !/^[0-9a-f]{40}$/u.test(sourceCommit ?? '')
    || !/^sha256:[0-9a-f]{64}$/u.test(sourceTreeDigest ?? '')
    || !/^sha256:[0-9a-f]{64}$/u.test(packageLockDigest ?? '')
    || fs.existsSync(path.join(root, '.git'))) {
    throw new Error('Arc Mainnet production builds require an isolated trusted Git snapshot.');
  }
  return Object.freeze({ sourceCommit, sourceTreeDigest, packageLockDigest });
}

function artifactDigest(directory, excluded = new Set()) {
  const digest = createHash('sha256');
  for (const relative of listFiles(directory).filter((file) => !excluded.has(file))) {
    digest.update(relative); digest.update('\0'); digest.update(fs.readFileSync(path.join(directory, relative))); digest.update('\0');
  }
  return `sha256:${digest.digest('hex')}`;
}

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
  fs.readFileSync(proofPath, 'utf8')
    .replace("../../analyzer/src/keccak.js", "../engine/keccak.js")
    .replace("../v4/network.js", "../proof-v4/network.js"),
);

const sourceConfig = await import(pathToFileURL(path.join(web, 'config.js')).href);
const buildProfile = process.env.VEILFORGE_BUILD_PROFILE || 'development';
const configuredNetworkKey = process.env.VEILFORGE_PROOF_NETWORK || sourceConfig.DEFAULT_WEB_NETWORK_KEY;
const webNetworks = JSON.parse(JSON.stringify(sourceConfig.WEB_NETWORKS));
const mainnetDeployment = JSON.parse(fs.readFileSync(path.join(root, 'deployment', 'arc-mainnet-registry-deployment.json'), 'utf8'));
const mainnetPublication = JSON.parse(fs.readFileSync(path.join(root, 'deployment', 'arc-mainnet-proof-publication.json'), 'utf8'));
const mainnetNetwork = webNetworks['arc-mainnet'];
assertMainnetDeploymentConfig(mainnetDeployment, mainnetNetwork);
assertMainnetProductionConfig(mainnetDeployment, mainnetPublication, mainnetNetwork);
const selectedNetwork = webNetworks[configuredNetworkKey];
if (!selectedNetwork) throw new Error(`VEILFORGE_PROOF_NETWORK is not trusted: ${configuredNetworkKey}`);
const legacyRegistryOverride = process.env.VITE_REGISTRY_ADDRESS || process.env.VEILFORGE_REGISTRY_ADDRESS;
if (configuredNetworkKey !== sourceConfig.DEFAULT_WEB_NETWORK_KEY && legacyRegistryOverride) {
  throw new Error('Legacy registry overrides are Testnet-only and cannot be applied to Arc Mainnet.');
}
if (configuredNetworkKey === sourceConfig.DEFAULT_WEB_NETWORK_KEY && legacyRegistryOverride) selectedNetwork.registryAddress = legacyRegistryOverride;
const configuredAddress = selectedNetwork.registryAddress;
const webV4Flag = process.env.VEILFORGE_WEB_V4_ENABLED;
const webV4Enabled = webV4Flag === undefined || webV4Flag === '' ? false : webV4Flag === 'true' || webV4Flag === '1' ? true : webV4Flag === 'false' || webV4Flag === '0' ? false : null;
const mainnetProductionBuild = buildProfile === 'arc-mainnet-production';
const sourceProvenance = mainnetProductionBuild ? resolveSourceCommit() : null;
const sourceCommit = sourceProvenance?.sourceCommit ?? null;
if (!['development', 'arc-mainnet-production'].includes(buildProfile)) throw new Error('VEILFORGE_BUILD_PROFILE is not trusted.');
if (mainnetProductionBuild && (outputDirectory !== 'dist-mainnet-production' || configuredNetworkKey !== 'arc-mainnet' || webV4Enabled !== true)) throw new Error('Arc Mainnet production builds require the dedicated output, explicit Mainnet network, and V4 runtime.');
if (!mainnetProductionBuild && outputDirectory === 'dist-mainnet-production') throw new Error('Mainnet production output requires VEILFORGE_BUILD_PROFILE=arc-mainnet-production.');
if (configuredNetworkKey === sourceConfig.DEFAULT_WEB_NETWORK_KEY && !validAddress(configuredAddress)) throw new Error('Registry address is invalid. Set VITE_REGISTRY_ADDRESS to a valid EVM address.');
if (configuredNetworkKey === 'arc-mainnet' && (!validAddress(configuredAddress) || selectedNetwork.enabled !== true || selectedNetwork.proofReadEnabled !== true || selectedNetwork.publishEnabled !== true || selectedNetwork.deploymentStatus !== 'verified' || selectedNetwork.publicationStatus !== 'verified')) {
  throw new Error('Arc Mainnet build requires the verified production Registry and first-publication evidence profile.');
}
if (webV4Enabled === null) throw new Error('VEILFORGE_WEB_V4_ENABLED must be true or false.');
fs.writeFileSync(
  path.join(dist, 'config.js'),
  `export const DEFAULT_WEB_NETWORK_KEY = ${JSON.stringify(configuredNetworkKey)};\nexport const WEB_NETWORKS = Object.freeze(${JSON.stringify(webNetworks)});\nexport function resolveWebNetworkConfig(networkKey = DEFAULT_WEB_NETWORK_KEY) { const network = WEB_NETWORKS[networkKey]; if (!network) throw new Error(\`Unknown proof network: \${networkKey}\`); return network; }\nexport const REGISTRY_ADDRESS = ${JSON.stringify(configuredAddress)};\nexport const BUILD_VERSION = '${webV4Enabled ? V4_PRODUCT_VERSION : '3.2.2'}';\nexport const WEB_V4_ENABLED = ${webV4Enabled};\n`,
);

if (webV4Enabled) {
  const landingPath = path.join(dist, 'index.html');
  const landing = buildV4GrantLanding(fs.readFileSync(landingPath, 'utf8')
    .replace(/<meta name="description" content="[^"]+" \/>/u, `<meta name="description" content="${V4_PRODUCT_NAME}, release ${V4_PRODUCT_VERSION}, report schema ${V4_REPORT_VERSION} - local, deterministic Solidity privacy analysis with verified findings and ${selectedNetwork.chainName} proof workflows." />`)
    .replace(/<title>[^<]+<\/title>/u, `<title>${V4_PRODUCT_NAME} - ${V4_PRODUCT_VERSION}</title>`)
    .replace('<a href="./app/index.html#scanner">Privacy OS</a><a href="#workflow">Architecture</a><a href="https://docs.arc.network/arc/concepts/opt-in-privacy" target="_blank" rel="noreferrer">Arc APS docs</a>', '<a href="./app/index.html#scanner">V4 Scanner</a><a href="#workflow">Workflow</a><a href="https://github.com/CryptoDombili/veilforge/tree/main/docs" target="_blank" rel="noreferrer">Documentation</a>')
    .replace(/<span class="landing-version">[^<]+<\/span>/u, `<abbr class="landing-version" title="Release ${V4_PRODUCT_VERSION} \u00b7 Report schema ${V4_REPORT_VERSION}" aria-label="${V4_PRODUCT_NAME}, release ${V4_PRODUCT_VERSION}, report schema ${V4_REPORT_VERSION}" tabindex="0">V4 GC</abbr>`)
    .replace(/<a class="release-badge"[^>]*>[\s\S]*?<\/a>/u, `<a class="release-badge" href="#product" aria-label="${V4_PRODUCT_NAME}, release ${V4_PRODUCT_VERSION}"><i></i> ${V4_PRODUCT_NAME} \u00b7 ${V4_PRODUCT_VERSION} <span>&rarr;</span></a>`)
    .replace(/<h1>[\s\S]*?<\/h1>/u, '<h1>Find privacy exposure.<br />Verify the evidence.<br /><em>Ship with confidence.</em></h1>')
    .replace(/<p class="flow-intro-copy">[\s\S]*?<\/p>/u, `<p class="flow-intro-copy">Run deterministic Solidity analysis locally, review source-backed findings, and prepare a verified ${selectedNetwork.chainName} proof without uploading source code.</p>`)
    .replace('Launch the Privacy OS', 'Launch V4 Scanner')
    .replace('<span>✓ No AI API</span><span>✓ Runs locally</span><span>✓ Privacy Genome</span><span>✓ Source-bound Passport</span>', `<span>✓ Local / private</span><span>✓ Deterministic</span><span>✓ Verified findings</span><span>✓ ${selectedNetwork.chainName} proof</span>`)
    .replace('VeilForge v3.2 privacy operating system showing Genome, Shadow and Passport states', `VeilForge V4 verified findings workflow from local scan to ${selectedNetwork.chainName} proof`)
    .replace('VEILFORGE V3.2 ASCENSION SYSTEM', 'VEILFORGE V4 VERIFIED WORKFLOW')
    .replace('One mission.<br />Sixteen control surfaces.', 'One clear path.<br />Verified evidence end to end.')
    .replace('Move from Project X-Ray and Privacy Genome through Shadow simulation, Forge, Bytecode Truth, Arc rehearsal and release proof without losing the audit trail.', 'Configure, scan, review, verify, publish and export through one evidence-first workflow. Advanced technical detail stays available when you need it.'), selectedNetwork);
  fs.writeFileSync(landingPath, landing);

  const appPath = path.join(dist, 'app', 'index.html');
  const app = fs.readFileSync(appPath, 'utf8')
    .replace(/<meta name="description" content="[^"]+" \/>/u, `<meta name="description" content="${V4_PRODUCT_NAME}, release ${V4_PRODUCT_VERSION}, report schema ${V4_REPORT_VERSION}." />`)
    .replace(/<title>[^<]+<\/title>/u, `<title>${V4_PRODUCT_NAME} - ${V4_PRODUCT_VERSION}</title>`)
    .replace(/<span class="versionPill">[^<]+<\/span>/u, `<span class="versionPill" title="Release ${V4_PRODUCT_VERSION} \u00b7 Report schema ${V4_REPORT_VERSION}">V4 GC</span>`)
    .replace(/<p class="chip">[\s\S]*?<\/p>/u, `<p class="chip"><i></i> ${V4_PRODUCT_NAME} \u00b7 ${V4_PRODUCT_VERSION}</p>`)
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

const inputAdapterPath = path.join(dist, 'v4', 'input-adapter.js');
const sourceResolverImport = '../../../packages/analyzer/src/v4/frontend/project-resolver.js';
const browserResolverImport = './runtime/browser-runtime-assets/engine/v4/frontend/project-resolver.js';
const inputAdapter = fs.readFileSync(inputAdapterPath, 'utf8');
if (!inputAdapter.includes(sourceResolverImport)) throw new Error('V4 browser resolver import transform target is missing.');
fs.writeFileSync(inputAdapterPath, inputAdapter.replace(sourceResolverImport, browserResolverImport));

const manifest = {
  name: webV4Enabled ? V4_PRODUCT_NAME : 'VeilForge Privacy Operating System',
  version: webV4Enabled ? V4_PRODUCT_VERSION : '3.2.2',
  ...(webV4Enabled ? {
    productVersion: V4_PRODUCT_VERSION,
    reportSchemaVersion: V4_REPORT_VERSION,
    legacyBuildVersion: '3.2.2',
  } : {}),
  output: 'static-es-modules',
  registryAddress: configuredAddress,
  proofNetworkKey: configuredNetworkKey,
  buildProfile,
  ...(sourceCommit ? { sourceCommit, sourceTreeDigest: sourceProvenance.sourceTreeDigest, packageLockDigest: sourceProvenance.packageLockDigest } : {}),
  generatedFiles: [],
};

const artifactStatus = webV4Enabled
  ? `# Generated V4 web artifact\n\nThis directory was generated with \`WEB_V4_ENABLED=true\`. The canonical reviewer build is created with \`npm run build:grant-release\` in \`dist-grant-release/\`.\n`
  : `# Checked-in compatibility artifact\n\nThis \`dist/\` tree is the repository-safe, source-default V3.2.2 compatibility build. It is not the canonical V4 Grant Candidate reviewer artifact.\n\nBuild and test the canonical reviewer artifact with:\n\n\`\`\`text\nnpm run build:grant-release\n\`\`\`\n\nThe command starts from a clean generated target and writes the V4 artifact to \`dist-grant-release/\`.\n`;
fs.writeFileSync(path.join(dist, 'README.md'), artifactStatus);

if (outputDirectory === 'dist-grant-release' || outputDirectory === 'dist-mainnet-production') {
  const releaseManifest = fs.readFileSync(path.join(root, 'RELEASE_MANIFEST.sha256'), 'utf8').replace(/\r\n?/gu, '\n');
  const metadata = {
    artifact: outputDirectory === 'dist-mainnet-production' ? 'veilforge-arc-mainnet-production-web' : 'veilforge-v4-grant-candidate-web',
    product: V4_PRODUCT_NAME,
    engineCompatibilityIdentity: V4_PRODUCT_VERSION,
    reportSchemaVersion: V4_REPORT_VERSION,
    hashPayloadVersion: 'veilforge.report.hash.v2',
    compilerVersion: '0.8.24',
    releaseManifestDigest: `sha256:${createHash('sha256').update(releaseManifest).digest('hex')}`,
    releaseManifestMeaning: 'Digest identity of RELEASE_MANIFEST.sha256; not proof that trusted CI verified it.',
    verificationCommand: outputDirectory === 'dist-mainnet-production' ? 'npm run verify:arc-mainnet-production' : 'npm run verify:grant-release',
    webV4Enabled: true,
    ...(sourceCommit ? { sourceCommit, sourceTreeDigest: sourceProvenance.sourceTreeDigest, packageLockDigest: sourceProvenance.packageLockDigest } : {}),
    arcMainnet: {
      enabled: mainnetNetwork.enabled,
      proofReadEnabled: mainnetNetwork.proofReadEnabled,
      publishEnabled: mainnetNetwork.publishEnabled,
      deploymentStatus: mainnetNetwork.deploymentStatus,
      registryAddress: mainnetNetwork.registryAddress,
      runtimeBytecodeDigest: mainnetNetwork.registryRuntimeBytecodeDigest,
      deploymentTransaction: mainnetNetwork.registryDeploymentTransaction,
      deploymentBlock: mainnetNetwork.registryDeploymentBlock,
      publicationStatus: mainnetNetwork.publicationStatus,
      firstProofTransaction: mainnetNetwork.firstProofTransaction,
      firstProofBlock: mainnetNetwork.firstProofBlock,
      firstProofPublisher: mainnetNetwork.firstProofPublisher,
      firstProofFixtureId: mainnetNetwork.firstProofFixtureId,
      firstProofProjectId: mainnetNetwork.firstProofProjectId,
      firstProofReportHash: mainnetNetwork.firstProofReportHash,
    },
  };
  const metadataName = outputDirectory === 'dist-mainnet-production' ? 'production-metadata.json' : 'grant-release-metadata.json';
  fs.writeFileSync(path.join(dist, metadataName), `${JSON.stringify(metadata, null, 2)}\n`);
}

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
buildWebV4Runtime({ root, dist });

manifest.generatedFiles = listFiles(dist);
fs.writeFileSync(path.join(dist, 'build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

if (mainnetProductionBuild) {
  const attestation = {
    schema: 'veilforge.production-artifact-attestation.v2',
    artifact: 'veilforge-arc-mainnet-production-web',
    sourceCommit,
    sourceTreeDigest: sourceProvenance.sourceTreeDigest,
    packageLockDigest: sourceProvenance.packageLockDigest,
    sourceSnapshot: 'git-archive-v1',
    dependencyInstall: 'npm-ci-lockfile',
    buildProfile,
    proofNetworkKey: configuredNetworkKey,
    releaseManifestDigest: JSON.parse(fs.readFileSync(path.join(dist, 'production-metadata.json'), 'utf8')).releaseManifestDigest,
    digestAlgorithm: 'sha256(path\\0bytes\\0)',
    artifactDigest: artifactDigest(dist, new Set(['production-attestation.json'])),
    fileCount: listFiles(dist).filter((file) => file !== 'production-attestation.json').length,
  };
  fs.writeFileSync(path.join(dist, 'production-attestation.json'), `${JSON.stringify(attestation, null, 2)}\n`);
}

for (const required of ['index.html', 'app.js', 'styles.css', 'engine/index.js', 'proof/registry.js', 'proof-v4/network.js', 'v4/proof-adapter.js', 'config.js', 'whitepaper/VeilForge_V4_Whitepaper.pdf', 'whitepaper/VeilForge_V4_Executive_Brief.pdf', 'whitepaper/figures/veilforge-architecture.svg', 'whitepaper/figures/configure-to-export-workflow.svg', 'whitepaper/figures/arc-testnet-proof-lifecycle.svg', 'whitepaper/figures/open-core-sustainability-loop.svg', 'whitepaper/figures/mainnet-staged-rollout.svg']) {
  if (!fs.existsSync(path.join(dist, required))) throw new Error(`Build output is missing ${required}.`);
}

console.log(`VeilForge web build created ${manifest.generatedFiles.length + 1} files in ${outputDirectory}/.`);
