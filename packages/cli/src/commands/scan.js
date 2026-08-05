import { readFile } from 'node:fs/promises';
import { discoverSources } from '../source-discovery.js';
import { createWorkerScan } from '../worker-client.js';
import { writeAtomicFile, writeExportPackage } from '../file-writer.js';
import { renderSarifJson, verifySarif } from '../../../sarif/src/index.js';
import { evaluateGate, loadGateConfig } from '../../../gate/src/index.js';
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
    const result = await worker.promise; let outputFiles = []; const integrations = {};
    if (!options['no-export']) outputFiles = await writeExportPackage(result.exportPackage, options.output, { overwrite: Boolean(options.overwrite) });
    const integrationRoot = options.output ?? io.cwd ?? process.cwd();
    if (options.sarif || options['sarif-output']) {
      const sarif = renderSarifJson(result.report); verifySarif(JSON.parse(sarif), { reportHash: result.report.integrity.reportHash, canonicalBytes: sarif });
      const requested = options['sarif-output']; const target = requested ? requested.toLowerCase().endsWith('.sarif') ? requested : path.join(requested, 'veilforge-results-v4.sarif') : path.join(integrationRoot, 'veilforge-results-v4.sarif');
      await writeAtomicFile(target, sarif, { overwrite: Boolean(options.overwrite) }); integrations.sarifPath = path.resolve(target); outputFiles.push(path.basename(target));
    }
    if (options['gate-config'] || options['gate-json'] || options['baseline-report']) {
      const gateConfig = await loadGateConfig(options['gate-config']).catch((error) => { throw cliError('CLI_CONFIG_INVALID', { causeCode: error.code }); });
      const config = options['baseline-report'] ? { ...gateConfig, baseline: { mode: 'new-only', report: await jsonFile(options['baseline-report'], 'CLI_REPORT_INVALID') } } : gateConfig;
      integrations.gate = await evaluateGate(result.report, config);
      if (options['gate-json']) { const target = path.join(integrationRoot, 'veilforge-gate-result-v4.json'); await writeAtomicFile(target, `${JSON.stringify(integrations.gate, null, 2)}\n`, { overwrite: Boolean(options.overwrite) }); integrations.gatePath = path.resolve(target); outputFiles.push(path.basename(target)); }
    }
    const outputLabel = options['no-export'] ? null : path.isAbsolute(options.output) ? path.basename(options.output) : options.output.replaceAll('\\', '/');
    const summary = scanSummary(result, input.projectId, outputFiles, outputLabel, integrations);
    if (integrations.gate?.passed === false) return { ...summary, ok: false, status: 'gate-failed', exitCode: 12 };
    return summary;
  } finally { process.removeListener('SIGINT', onSigint); }
}
