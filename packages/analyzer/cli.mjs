#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { formatMarkdownReport, formatTextReport, generatePolicyManifest, scanProject } from './src/index.js';

function collectSolidityFiles(target) {
  const absolute = path.resolve(target);
  if (!fs.existsSync(absolute)) throw new Error(`Path not found: ${target}`);
  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    if (!absolute.toLowerCase().endsWith('.sol')) throw new Error('Input file must use the .sol extension.');
    return [{ path: path.basename(absolute), content: fs.readFileSync(absolute, 'utf8') }];
  }
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.sol')) {
        files.push({ path: path.relative(absolute, full).replaceAll(path.sep, '/'), content: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(absolute);
  return files;
}

function usage() {
  console.log('Usage: node packages/analyzer/cli.mjs scan <file-or-directory> [--format text|json|markdown|policy] [--output file]');
}

const args = process.argv.slice(2);
if (args[0] !== 'scan' || !args[1]) {
  usage();
  process.exitCode = 1;
} else {
  try {
    const target = args[1];
    const formatIndex = args.indexOf('--format');
    const outputIndex = args.indexOf('--output');
    const format = formatIndex >= 0 ? args[formatIndex + 1] : 'text';
    const output = outputIndex >= 0 ? args[outputIndex + 1] : null;
    const report = scanProject(collectSolidityFiles(target));
    let rendered;
    if (format === 'json') rendered = `${JSON.stringify(report, null, 2)}\n`;
    else if (format === 'markdown') rendered = formatMarkdownReport(report, path.basename(path.resolve(target)));
    else if (format === 'policy') rendered = `${JSON.stringify(generatePolicyManifest(report), null, 2)}\n`;
    else rendered = `${formatTextReport(report)}\n`;

    if (output) fs.writeFileSync(path.resolve(output), rendered);
    else process.stdout.write(rendered);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
