import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { assertMainnetProductionConfig } from './lib/mainnet-read-activation.mjs';
import { assertProductionArtifactProvenance, assertProductionCheckout, verifyProductionArtifactAgainstTrustedSnapshot } from './lib/production-provenance.mjs';
import { verifyWebV4RuntimeAssets } from './lib/web-v4-runtime-assets.mjs';

const root = process.cwd();
const output = path.join(root, 'dist-mainnet-production');

// Establish the release expectation exclusively from the clean, exact Git
// snapshot before reading or executing any mutable candidate artifact bytes.
const provenance = assertProductionCheckout(root);
const trustedArtifact = verifyProductionArtifactAgainstTrustedSnapshot({ root });
if (trustedArtifact.provenance.sourceCommit !== provenance.sourceCommit
  || trustedArtifact.provenance.sourceTreeDigest !== provenance.sourceTreeDigest
  || trustedArtifact.provenance.packageLockDigest !== provenance.packageLockDigest
  || trustedArtifact.provenance.releaseManifestDigest !== provenance.releaseManifestDigest) {
  throw new Error('Trusted production release expectation changed during verification.');
}

const read = (relative) => fs.readFileSync(path.join(output, relative), 'utf8');
for (const required of ['config.js', 'build-manifest.json', 'production-metadata.json', 'production-attestation.json', 'proof-v4/network.js', 'v4/proof-send-boundary.js']) {
  if (!fs.existsSync(path.join(output, required))) throw new Error(`Arc Mainnet production artifact is missing ${required}.`);
}

const config = await import(`${pathToFileURL(path.join(output, 'config.js')).href}?verify=arc-mainnet-production`);
const build = JSON.parse(read('build-manifest.json'));
const metadata = JSON.parse(read('production-metadata.json'));
const attestation = JSON.parse(read('production-attestation.json'));
const landing = read('index.html');
const deployment = JSON.parse(fs.readFileSync(path.join(root, 'deployment', 'arc-mainnet-registry-deployment.json'), 'utf8'));
const publication = JSON.parse(fs.readFileSync(path.join(root, 'deployment', 'arc-mainnet-proof-publication.json'), 'utf8'));
const mainnet = config.WEB_NETWORKS['arc-mainnet'];
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const productionHeaders = Object.fromEntries(vercel.headers?.find((item) => item.source === '/(.*)')?.headers?.map(({ key, value }) => [key, value]) ?? []);
const runtimeAssets = verifyWebV4RuntimeAssets(output, { csp: productionHeaders['Content-Security-Policy'] });

if (config.DEFAULT_WEB_NETWORK_KEY !== 'arc-mainnet' || config.WEB_V4_ENABLED !== true) throw new Error('Production artifact does not explicitly select Arc Mainnet V4.');
if (!landing.includes('<span>✓ Arc Mainnet proof</span>')
  || !landing.includes('VeilForge V4 verified findings workflow from local scan to Arc Mainnet proof')
  || landing.includes('<span>✓ Arc Testnet proof</span>')) throw new Error('Production landing current-network wording is invalid.');
if (build.buildProfile !== 'arc-mainnet-production' || build.proofNetworkKey !== 'arc-mainnet' || build.registryAddress !== mainnet.registryAddress) throw new Error('Production build identity is invalid.');
if (metadata.artifact !== 'veilforge-arc-mainnet-production-web' || metadata.verificationCommand !== 'npm run verify:arc-mainnet-production') throw new Error('Production metadata identity is invalid.');
assertProductionArtifactProvenance({ build, metadata, attestation }, provenance);
if (attestation.schema !== 'veilforge.production-artifact-attestation.v2'
  || attestation.sourceSnapshot !== 'git-archive-v1'
  || attestation.dependencyInstall !== 'npm-ci-lockfile'
  || attestation.artifact !== metadata.artifact
  || attestation.buildProfile !== build.buildProfile
  || attestation.proofNetworkKey !== build.proofNetworkKey
  || attestation.releaseManifestDigest !== metadata.releaseManifestDigest) throw new Error('Production artifact attestation identity is invalid.');
const files = [];
const walk = (current) => { for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const full = path.join(current, entry.name); if (entry.isDirectory()) walk(full); else files.push(path.relative(output, full).replaceAll(path.sep, '/')); } };
walk(output);
const attestedFiles = files.filter((file) => file !== 'production-attestation.json');
const digest = createHash('sha256');
for (const relative of attestedFiles) { digest.update(relative); digest.update('\0'); digest.update(fs.readFileSync(path.join(output, relative))); digest.update('\0'); }
if (attestation.fileCount !== attestedFiles.length || attestation.artifactDigest !== `sha256:${digest.digest('hex')}`) throw new Error('Production artifact byte attestation is invalid.');
assertMainnetProductionConfig(deployment, publication, mainnet);
if (metadata.arcMainnet.enabled !== true
  || metadata.arcMainnet.proofReadEnabled !== true
  || metadata.arcMainnet.publishEnabled !== true
  || metadata.arcMainnet.deploymentStatus !== 'verified'
  || metadata.arcMainnet.publicationStatus !== 'verified'
  || metadata.arcMainnet.deploymentTransaction !== deployment.transactionHash
  || metadata.arcMainnet.runtimeBytecodeDigest !== deployment.runtimeBytecodeDigest
  || metadata.arcMainnet.firstProofTransaction !== publication.transactionHash
  || metadata.arcMainnet.firstProofBlock !== publication.blockNumber
  || metadata.arcMainnet.firstProofProjectId !== publication.projectId
  || metadata.arcMainnet.firstProofReportHash !== publication.reportHash) throw new Error('Production metadata does not match verified deployment and publication evidence.');

console.log(JSON.stringify({
  verified: true,
  artifact: metadata.artifact,
  buildProfile: build.buildProfile,
  networkKey: config.DEFAULT_WEB_NETWORK_KEY,
  chainId: mainnet.chainId,
  registryAddress: mainnet.registryAddress,
  publishEnabled: mainnet.publishEnabled,
  workerAssetPaths: runtimeAssets.workerAssetPaths,
  compilerAssets: runtimeAssets.compilerAssets,
  cspCompatible: runtimeAssets.cspCompatible,
  reachableWorkerModules: runtimeAssets.reachableModuleCount,
  expectedArtifactDigest: trustedArtifact.expectedArtifactDigest,
  deploymentTransaction: metadata.arcMainnet.deploymentTransaction,
  firstProofTransaction: metadata.arcMainnet.firstProofTransaction,
}));
