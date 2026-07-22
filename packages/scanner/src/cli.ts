#!/usr/bin/env node
import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { formatMarkdownReport, formatTextReport, formatTreatmentPlanMarkdown } from './format.js';
import { generatePolicyManifest } from './mission.js';
import { scanSources } from './scanner.js';
import type { ScanReport, Severity, SourceFile } from './types.js';

type OutputFormat = 'text' | 'json' | 'markdown' | 'policy' | 'treatment';

async function collectSolidityFiles(inputPath: string): Promise<SourceFile[]> {
  const absolute = path.resolve(inputPath);
  const stat = await fs.stat(absolute);

  if (stat.isFile()) {
    if (!absolute.toLowerCase().endsWith('.sol')) throw new Error('Input file must use the .sol extension.');
    return [{ path: path.basename(absolute), content: await fs.readFile(absolute, 'utf8') }];
  }

  if (!stat.isDirectory()) throw new Error('Input must be a Solidity file or directory.');

  const files: SourceFile[] = [];
  async function walk(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', 'artifacts', 'cache', 'dist', '.git'].includes(entry.name)) continue;
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.sol')) {
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

function parseFormat(value: string | undefined, legacyJson: boolean | undefined): OutputFormat {
  if (legacyJson) return 'json';
  const format = (value ?? 'text').toLowerCase();
  if (!['text', 'json', 'markdown', 'policy', 'treatment'].includes(format)) {
    throw new Error(`Unsupported format "${format}". Use text, json, markdown, policy or treatment.`);
  }
  return format as OutputFormat;
}

function parseSeverity(value: string | undefined): Severity | undefined {
  if (value === undefined) return undefined;
  if (!['critical', 'high', 'medium', 'low'].includes(value)) {
    throw new Error(`Unsupported severity "${value}". Use critical, high, medium or low.`);
  }
  return value as Severity;
}

function renderReport(report: ScanReport, format: OutputFormat, projectName: string): string {
  switch (format) {
    case 'json':
      return `${JSON.stringify(report, null, 2)}\n`;
    case 'markdown':
      return formatMarkdownReport(report, projectName);
    case 'policy':
      return `${JSON.stringify(generatePolicyManifest(report), null, 2)}\n`;
    case 'treatment':
      return `${formatTreatmentPlanMarkdown(report)}\n`;
    case 'text':
      return `${formatTextReport(report)}\n`;
  }
}

const program = new Command();
program
  .name('veilforge')
  .description('Local, deterministic pre-APS privacy-readiness engine for Solidity projects.')
  .version('1.8.0');

program
  .command('scan')
  .argument('<path>', 'Solidity file or directory')
  .option('--format <format>', 'text, json, markdown, policy or treatment', 'text')
  .option('--json', 'legacy alias for --format json')
  .option('--project-name <name>', 'project label used in Markdown output', 'VeilForge scan')
  .option('-o, --output <file>', 'write output to a file')
  .option('--fail-on <severity>', 'exit 1 when findings meet critical, high, medium or low')
  .action(async (
    inputPath: string,
    options: {
      format?: string;
      json?: boolean;
      projectName?: string;
      output?: string;
      failOn?: string;
    },
  ) => {
    try {
      const format = parseFormat(options.format, options.json);
      const failOn = parseSeverity(options.failOn);
      const files = await collectSolidityFiles(inputPath);
      if (files.length === 0) throw new Error('No Solidity files were found.');

      const report = scanSources(files);
      const output = renderReport(report, format, options.projectName ?? 'VeilForge scan');
      if (options.output) {
        const destination = path.resolve(options.output);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, output, 'utf8');
        console.log(`Wrote VeilForge ${format} output to ${destination}`);
      } else {
        process.stdout.write(output);
      }

      const rank: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      const threshold = failOn ? rank[failOn] : 0;
      const shouldFail = report.findings.some(
        (finding) => threshold > 0 && rank[finding.severity] >= threshold,
      );
      process.exitCode = shouldFail ? 1 : 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`VeilForge failed: ${message}`);
      process.exitCode = 3;
    }
  });

await program.parseAsync(process.argv);
