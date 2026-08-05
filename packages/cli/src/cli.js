import { parseArgs } from './args.js';
import { mergeExplicitConfig } from './config.js';
import { scanCommand } from './commands/scan.js';
import { verifyReportCommand } from './commands/verify-report.js';
import { verifyExportCommand } from './commands/verify-export.js';
import { gateCommand } from './commands/gate.js';
import { helpCommand } from './commands/help.js';
import { versionText } from './commands/version.js';
import { publicCliError } from './errors.js';
import { jsonDocument } from './json-mode.js';
import { terminalSummary } from './terminal.js';

export async function runCli(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? ((text) => process.stdout.write(text)); const stderr = io.stderr ?? ((text) => process.stderr.write(text));
  const jsonRequested = argv.includes('--json') || argv.includes('--gate-json');
  try {
    const parsed = parseArgs(argv);
    if (parsed.command === 'help') { stdout(helpCommand()); return 0; }
    if (parsed.command === 'version') { stdout(versionText()); return 0; }
    const options = parsed.command === 'gate' ? { ...parsed.options, 'gate-config': parsed.options['gate-config'] ?? parsed.options.config, config: undefined } : await mergeExplicitConfig(parsed.options); let result;
    if (parsed.command === 'scan') result = await scanCommand(options, { cwd: io.cwd, writeProgress: (text) => stderr(text) });
    else if (parsed.command === 'verify-report') result = await verifyReportCommand(parsed.positionals[0]);
    else if (parsed.command === 'verify-export') result = await verifyExportCommand(parsed.positionals[0]);
    else result = await gateCommand(options);
    if (options.json || options['gate-json']) stdout(jsonDocument(result));
    else if (!options.quiet) stdout(parsed.command === 'scan' ? terminalSummary(result) : parsed.command === 'gate' ? `gate: ${result.status}\n` : `${parsed.command}: verified\n`);
    return result.exitCode;
  } catch (error) {
    const item = publicCliError(error); const json = jsonRequested ? jsonDocument({ ok: false, status: 'failed', ...item, errors: [item] }) : null;
    if (json) stdout(json); else stderr(`VeilForge: ${item.message} [${item.code}]\n`);
    return item.exitCode;
  }
}
