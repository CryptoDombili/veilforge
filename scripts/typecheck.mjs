import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = process.cwd();
const ignored = new Set(['node_modules', '.git']);
const sourceFiles = [];
const jsonFiles = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:js|mjs)$/.test(entry.name)) sourceFiles.push(full);
    else if (entry.name.endsWith('.json')) jsonFiles.push(full);
  }
}
walk(root);

const failures = [];
for (const file of sourceFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${path.relative(root, file)}\n${result.stderr || result.stdout}`);
}
for (const file of jsonFiles) {
  try { JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { failures.push(`${path.relative(root, file)}\n${error.message}`); }
}

const packageLock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
if (packageLock.lockfileVersion !== 3) failures.push('package-lock.json must use lockfileVersion 3.');

if (failures.length) {
  console.error(failures.join('\n\n'));
  process.exitCode = 1;
} else {
  console.log(`Static validation passed for ${sourceFiles.length} JavaScript modules and ${jsonFiles.length} JSON files.`);
}
