import { verifyExportPackage } from '../../../sdk/src/exports.js';
import { readExportDirectory } from '../file-writer.js';
import { cliError } from '../errors.js';
export async function verifyExportCommand(directory) {
  if (!directory) throw cliError('CLI_ARGUMENT_INVALID');
  try { const result = verifyExportPackage(await readExportDirectory(directory)); return { ok: true, status: 'verified', exitCode: 0, reportHash: result.reportHash, packageDigest: result.packageDigest, outputFiles: result.files, errors: [] }; }
  catch (error) { if (error?.code === 'CLI_ARGUMENT_INVALID') throw error; throw cliError('CLI_EXPORT_INVALID', { causeCode: error?.causeCode ?? error?.code ?? null }); }
}
