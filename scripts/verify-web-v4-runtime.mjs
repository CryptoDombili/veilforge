import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'dist', 'v4');
const manifestPath = path.join(output, 'veilforge-v4-scanner.worker.manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const digest = (value) => createHash('sha256').update(value).digest('hex');
const compiler = fs.readFileSync(path.join(root, 'node_modules', 'solc', 'soljson.js'));
if (manifest.compilerVersion !== '0.8.24' || manifest.compilerDigest !== `sha256:${digest(compiler)}`) throw new Error('Compiler version or digest verification failed.');
if (manifest.supportedReportSchema !== '4.1.0' || manifest.hashPayloadVersion !== 'veilforge.report.hash.v2') throw new Error('Runtime report contract mismatch.');
const files = manifest.generatedFiles;
for (const file of files) if (!fs.existsSync(path.join(output, file))) throw new Error(`Runtime file missing: ${file}`);
const aggregate = digest(files.map((file) => `${file}\0${digest(fs.readFileSync(path.join(output, file)))}`).join('\n'));
if (manifest.workerDigest !== `sha256:${aggregate}`) throw new Error('Worker aggregate digest verification failed.');
const text = files.map((file) => fs.readFileSync(path.join(output, file), 'utf8')).join('\n');
for (const forbidden of [root, process.env.USERNAME, 'new Function', 'eval(', 'XMLHttpRequest', 'WebSocket(', 'EventSource(', 'sendBeacon(', 'https://binaries.soliditylang.org']) {
  if (forbidden && text.includes(forbidden)) throw new Error(`Forbidden runtime content detected: ${forbidden}`);
}
if (/from\s*['"]node:/u.test(text)) throw new Error('Browser runtime contains a Node built-in import.');
console.log(JSON.stringify({ verified: true, compilerVersion: manifest.compilerVersion, compilerDigest: manifest.compilerDigest, workerDigest: manifest.workerDigest, files: files.length }));
