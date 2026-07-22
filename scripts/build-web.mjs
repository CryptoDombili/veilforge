import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const dist = path.join(root, 'dist');
const web = path.join(root, 'apps', 'web');

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
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
copyDirectory(path.join(root, 'examples'), path.join(dist, 'examples'));

const proofPath = path.join(dist, 'proof', 'registry.js');
fs.writeFileSync(
  proofPath,
  fs.readFileSync(proofPath, 'utf8').replace("../../analyzer/src/keccak.js", "../engine/keccak.js"),
);

const sourceConfig = await import(path.toNamespacedPath(path.join(web, 'config.js')));
const configuredAddress = process.env.VITE_REGISTRY_ADDRESS || process.env.VEILFORGE_REGISTRY_ADDRESS || sourceConfig.REGISTRY_ADDRESS;
if (!validAddress(configuredAddress)) throw new Error('Registry address is invalid. Set VITE_REGISTRY_ADDRESS to a valid EVM address.');
fs.writeFileSync(
  path.join(dist, 'config.js'),
  `export const REGISTRY_ADDRESS = '${configuredAddress}';\nexport const BUILD_VERSION = '1.8.0';\n`,
);

const manifest = {
  name: 'VeilForge Privacy Mission Control',
  version: '1.8.0',
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

for (const required of ['index.html', 'app.js', 'styles.css', 'engine/index.js', 'proof/registry.js', 'config.js']) {
  if (!fs.existsSync(path.join(dist, required))) throw new Error(`Build output is missing ${required}.`);
}

console.log(`VeilForge web build created ${manifest.generatedFiles.length + 1} files in dist/.`);
