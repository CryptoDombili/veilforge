import { verifyReportIntegrity } from '../../analyzer/src/v4/report/index.js';
import { verifyExportPackage as internalVerifyExport, getExportFile as internalGetExportFile, listExportFiles as internalListExportFiles } from '../../analyzer/src/v4/export/index.js';
import { sdkError } from './errors.js';
import { clonePublic, immutablePublic } from './types.js';

export function verifyReport(report) {
  try {
    const clone = clonePublic(report);
    if (!verifyReportIntegrity(clone)) throw sdkError('SDK_REPORT_INVALID');
    return immutablePublic({ verified: true, reportHash: clone.integrity.reportHash });
  } catch (error) {
    if (error?.code === 'SDK_REPORT_INVALID') throw error;
    throw sdkError('SDK_REPORT_INVALID', { causeCode: error?.code ?? null });
  }
}

export function verifyExportPackage(pkg) {
  try {
    const result = internalVerifyExport(clonePublic(pkg), { throwOnMismatch: false });
    if (!result.verified) throw sdkError('SDK_EXPORT_INVALID', { causeCode: result.error?.code ?? null });
    return immutablePublic(result);
  } catch (error) {
    if (error?.code === 'SDK_EXPORT_INVALID') throw error;
    throw sdkError('SDK_EXPORT_INVALID', { causeCode: error?.code ?? null });
  }
}

export function getExportFile(pkg, filename) {
  try { return internalGetExportFile(clonePublic(pkg), filename); }
  catch (error) { throw sdkError('SDK_EXPORT_INVALID', { causeCode: error?.code ?? null }); }
}

export function listExportFiles(pkg) {
  try { return Object.freeze(internalListExportFiles(clonePublic(pkg))); }
  catch (error) { throw sdkError('SDK_EXPORT_INVALID', { causeCode: error?.code ?? null }); }
}
