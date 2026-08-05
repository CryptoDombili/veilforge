import { readFile } from 'node:fs/promises';
import { evaluateExportGate, evaluateGate, loadGateConfig } from '../../../gate/src/index.js';
import { readExportDirectory } from '../file-writer.js';
import { cliError } from '../errors.js';

async function readJson(filename, code) { try { return JSON.parse(await readFile(filename, 'utf8')); } catch { throw cliError(code); } }
async function configWithBaseline(options) {
  const config = await loadGateConfig(options['gate-config']).catch((error) => { throw cliError('CLI_CONFIG_INVALID', { causeCode: error.code }); });
  if (!options['baseline-report']) return config;
  return { ...config, baseline: { mode: 'new-only', report: await readJson(options['baseline-report'], 'CLI_REPORT_INVALID') } };
}
export async function gateCommand(options) {
  if (Boolean(options.report) === Boolean(options.export)) throw cliError('CLI_ARGUMENT_INVALID', { safeDetails: { reason: 'exactly-one-report-or-export' } });
  const config = await configWithBaseline(options);
  try {
    const result = options.report ? await evaluateGate(await readJson(options.report, 'CLI_REPORT_INVALID'), config) : await evaluateExportGate(await readExportDirectory(options.export), config);
    return { ok: result.passed, status: result.status, exitCode: result.exitCode, gate: result };
  } catch (error) {
    if (error.code === 'GATE_CONFIG_INVALID') throw cliError('CLI_CONFIG_INVALID', { causeCode: error.code });
    if (error.code === 'GATE_REPORT_INVALID') throw cliError('CLI_REPORT_INVALID', { causeCode: error.code });
    if (error.code === 'GATE_EXPORT_INVALID') throw cliError('CLI_EXPORT_INVALID', { causeCode: error.code });
    throw error;
  }
}
