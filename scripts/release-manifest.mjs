import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const outputFile = 'RELEASE_MANIFEST.sha256';
const ignoredDirectories = new Set(['.git', 'dist', 'node_modules', 'coverage']);
const ignoredFiles = new Set([outputFile, '.DS_Store']);

async function collectFiles(directory = '.') {
  const absolute = path.join(root, directory);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relative = path.posix.join(directory === '.' ? '' : directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...await collectFiles(relative));
      continue;
    }
    if (!entry.isFile() || ignoredFiles.has(entry.name) || entry.name.endsWith('.zip')) continue;
    files.push(relative);
  }

  return files.sort((a, b) => a.localeCompare(b));
}

async function buildManifest() {
  const files = await collectFiles();
  const rows = [];
  for (const file of files) {
    const data = await readFile(path.join(root, file));
    const hash = createHash('sha256').update(data).digest('hex');
    rows.push(`${hash}  ${file}`);
  }
  return `${rows.join('\n')}\n`;
}

const mode = process.argv[2] ?? '--check';
const expected = await buildManifest();

if (mode === '--write') {
  await writeFile(path.join(root, outputFile), expected);
  console.log(`Wrote ${outputFile}.`);
} else if (mode === '--check') {
  const current = await readFile(path.join(root, outputFile), 'utf8').catch(() => '');
  if (current !== expected) {
    console.error(`${outputFile} is stale. Run: npm run manifest:write`);
    process.exit(1);
  }
  console.log(`${outputFile} matches the current release sources.`);
} else {
  console.error('Usage: node scripts/release-manifest.mjs --write|--check');
  process.exit(1);
}
