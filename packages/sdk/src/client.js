import { scanProject } from './scan.js';
import { createScanSession } from './session.js';
import { verifyReport, verifyExportPackage, getExportFile, listExportFiles } from './exports.js';
import { immutablePublic } from './types.js';
import { sdkError } from './errors.js';

export function createVeilForgeClient(configuration = {}) {
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) throw sdkError('SDK_OPTION_INVALID');
  const { compiler, ...options } = configuration;
  const defaults = immutablePublic({ compiler: compiler ? structuredClone(compiler) : { version: '0.8.24' }, options });
  return Object.freeze({
    scanProject: (input, scanOptions) => scanProject(input, scanOptions, defaults),
    createScanSession: (input, scanOptions) => createScanSession(input, scanOptions, defaults),
    verifyReport,
    verifyExportPackage,
    getExportFile,
    listExportFiles,
  });
}
