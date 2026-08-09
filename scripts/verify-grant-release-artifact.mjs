import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const output = path.join(root, 'dist-grant-release');
const read = (relative) => fs.readFileSync(path.join(output, relative), 'utf8');

for (const required of ['index.html', 'app/index.html', 'config.js', 'build-manifest.json', 'grant-release-metadata.json']) {
  if (!fs.existsSync(path.join(output, required))) throw new Error(`Grant release artifact is missing ${required}.`);
}

const config = await import(`${pathToFileURL(path.join(output, 'config.js')).href}?verify=grant-release`);
const build = JSON.parse(read('build-manifest.json'));
const metadata = JSON.parse(read('grant-release-metadata.json'));
const landing = read('index.html');
const app = read('app/index.html');
const mainnet = await import(`${pathToFileURL(path.join(output, 'proof-v4', 'mainnet-readiness.js')).href}?verify=grant-release`);

if (config.WEB_V4_ENABLED !== true || config.BUILD_VERSION !== '4.0.0-gc.1') throw new Error('Grant artifact is not explicitly V4-enabled.');
if (build.name !== 'VeilForge V4 Grant Candidate' || build.productVersion !== '4.0.0-gc.1' || build.reportSchemaVersion !== '4.1.0') throw new Error('Grant artifact build identity is invalid.');
if (metadata.artifact !== 'veilforge-v4-grant-candidate-web' || metadata.reportSchemaVersion !== '4.1.0' || metadata.hashPayloadVersion !== 'veilforge.report.hash.v2') throw new Error('Grant artifact metadata identity is invalid.');
if (metadata.webV4Enabled !== true || Object.values(metadata.arcMainnet).some((value) => value !== false)) throw new Error('Grant artifact safety gates are invalid.');
if (!/^sha256:[0-9a-f]{64}$/u.test(metadata.releaseManifestDigest) || 'manifestVerified' in metadata) throw new Error('Grant artifact manifest provenance is invalid.');
if (mainnet.ARC_MAINNET_UNRESOLVED.enabled !== false || mainnet.ARC_MAINNET_UNRESOLVED.proofReadEnabled !== false || mainnet.ARC_MAINNET_UNRESOLVED.publishEnabled !== false) throw new Error('Arc mainnet is not fail-closed.');
for (const html of [landing, app]) {
  if (!html.includes('VeilForge V4 Grant Candidate') || !html.includes('4.0.0-gc.1')) throw new Error('Reviewer-facing V4 identity is missing.');
  if (/VeilForge v3\.2\.2|V3\.2 ASCENSION|REGISTRY SECURITY UPDATE/u.test(html)) throw new Error('Stale V3 reviewer-facing identity detected.');
}

console.log(JSON.stringify({ verified: true, artifact: metadata.artifact, product: metadata.product, engineCompatibilityIdentity: metadata.engineCompatibilityIdentity, reportSchemaVersion: metadata.reportSchemaVersion, manifestDigest: metadata.releaseManifestDigest, mainnetEnabled: false }));
