import { readFile } from 'node:fs/promises';
import { discoverSources } from '../source-discovery.js';
import { createWorkerScan } from '../worker-client.js';
import { writeExportPackage } from '../file-writer.js';
import { createProgressWriter } from '../progress.js';
import { scanSummary } from '../output.js';
import { cliError } from '../errors.js';
import path from 'node:path';

const DOMAINS = Object.freeze({ payments: 'arc-payments', treasury: 'arc-treasury', 'private-credit': 'arc-private-credit', 'arc-payments': 'arc-payments', 'arc-treasury': 'arc-treasury', 'arc-private-credit': 'arc-private-credit' });
function positiveInteger(value, fallback) { if (value === undefined) return fallback; const number = Number(value); if (!Number.isInteger(number) || number <= 0) throw cliError('CLI_ARGUMENT_INVALID'); return number; }
async function jsonFile(filename, code) { if (!filename) return undefined; try { return JSON.parse(await readFile(filename, 'utf8')); } catch { throw cliError(code); } }
async function textFile(filename, code) { if (!filename) return undefined; try { return await readFile(filename, 'utf8'); } catch { throw cliError(code); } }
export async function scanCommand(options, io = {}) {
  if (typeof options['project-id'] !== 'string' || !options['project-id'].trim()) throw cliError('CLI_ARGUMENT_INVALID');
  if (!options['no-export'] && !options.output) throw cliError('CLI_ARGUMENT_INVALID', { safeDetails: { reason: 'output-required' } });
  const stageTimeoutMs = positiveInteger(options['stage-timeout'], 120_000); const globalTimeoutMs = positiveInteger(options['global-timeout'], 300_000);
  const maxFileBytes = positiveInteger(options['max-file-bytes'], 2 * 1024 * 1024); const maxProjectBytes = positiveInteger(options['max-project-bytes'], 20 * 1024 * 1024);
  const domains = [...new Set((options.domain ?? ['payments']).map((name) => DOMAINS[name]))]; if (domains.some((item) => !item)) throw cliError('CLI_ARGUMENT_INVALID');
  const sources = await discoverSources({ source: options.source ?? [], file: options.file ?? [], cwd: io.cwd ?? process.cwd(), maxFileBytes, maxProjectBytes });
  const input = {
    projectId: options['project-id'], projectName: options['project-name'], sources, domains,
    compiler: { version: options['compiler-version'] ?? '0.8.24' }, settings: await jsonFile(options.settings, 'CLI_CONFIG_INVALID'),
    policy: await jsonFile(options.policy, 'CLI_CONFIG_INVALID'), taxonomy: await textFile(options.taxonomy, 'CLI_CONFIG_INVALID'),
  };
  const progress = createProgressWriter({ enabled: !options.json && !options.quiet && !options['no-progress'], write: io.writeProgress });
  const controller = new AbortController();
  const worker = createWorkerScan(input, { hardTimeoutMs: globalTimeoutMs, signal: controller.signal, onProgress: progress, sdkOptions: { stageTimeoutMs, globalTimeoutMs, includeOperationalMetadata: Boolean(options['include-operational-metadata']), export: !options['no-export'] } });
  let sigints = 0; const onSigint = () => { sigints += 1; if (sigints === 1) controller.abort(); else worker.forceKill(); };
  process.on('SIGINT', onSigint);
  try {
    const result = await worker.promise; let outputFiles = [];
    if (!options['no-export']) outputFiles = await writeExportPackage(result.exportPackage, options.output, { overwrite: Boolean(options.overwrite) });
    const outputLabel = options['no-export'] ? null : path.isAbsolute(options.output) ? path.basename(options.output) : options.output.replaceAll('\\', '/');
    return scanSummary(result, input.projectId, outputFiles, outputLabel);
  } finally { process.removeListener('SIGINT', onSigint); }
}
