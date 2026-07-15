#!/usr/bin/env node
import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { formatTextReport } from './format.js';
import { scanSources } from './scanner.js';
import type { SourceFile } from './types.js';

async function collectSolidityFiles(inputPath: string): Promise<SourceFile[]> {
  const absolute = path.resolve(inputPath);
  const stat = await fs.stat(absolute);

  if (stat.isFile()) {
    if (!absolute.endsWith('.sol')) throw new Error('Input file must use the .sol extension.');
    return [{ path: path.basename(absolute), content: await fs.readFile(absolute, 'utf8') }];
  }

  if (!stat.isDirectory()) throw new Error('Input must be a Solidity file or directory.');

  const files: SourceFile[] = [];
  async function walk(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'artifacts' || entry.name === 'cache') continue;
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.sol')) {
        files.push({
          path: path.relative(absolute, fullPath).replaceAll('\\', '/'),
          content: await fs.readFile(fullPath, 'utf8'),
        });
      }
    }
  }

  await walk(absolute);
  return files;
}

const program = new Command();
program.name('veilforge').description('Deterministic pre-APS privacy-readiness scanner for Solidity.');

program
  .command('scan')
  .argument('<path>', 'Solidity file or directory')
  .option('--json', 'print canonical JSON instead of text')
  .option('-o, --output <file>', 'write the report to a file')
  .option('--fail-on <severity>', 'exit nonzero when findings meet critical, high, medium or low')
  .action(async (
    inputPath: string,
    options: { json?: boolean; output?: string; failOn?: 'critical' | 'high' | 'medium' | 'low' },
  ) => {
    try {
      const files = await collectSolidityFiles(inputPath);
      if (files.length === 0) throw new Error('No Solidity files were found.');
      const report = scanSources(files);
      const output = options.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatTextReport(report)}\n`;
      if (options.output) {
        await fs.writeFile(path.resolve(options.output), output, 'utf8');
        console.log(`Wrote VeilForge report to ${path.resolve(options.output)}`);
      } else {
        process.stdout.write(output);
      }
      const rank = { critical: 4, high: 3, medium: 2, low: 1 } as const;
      const threshold = options.failOn ? rank[options.failOn] : 0;
      const shouldFail = report.findings.some((finding) => rank[finding.severity] >= threshold && threshold > 0);
      process.exitCode = shouldFail ? 1 : 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`VeilForge failed: ${message}`);
      process.exitCode = 3;
    }
  });

await program.parseAsync(process.argv);
