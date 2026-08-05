import { readFile } from 'node:fs/promises';
import { verifyReport } from '../../../sdk/src/exports.js';
import { cliError } from '../errors.js';
const REQUIRED = ['schema', 'schemaVersion', 'reportVersion', 'scanner', 'project', 'scan', 'compiler', 'inputs', 'analysis', 'policy', 'summary', 'findings', 'integrity', 'extensions'];
const ALLOWED = new Set(REQUIRED); const SEVERITY = new Set(['critical', 'high', 'medium', 'low', 'informational', 'unknown']); const DISPOSITION = new Set(['detected', 'policy-approved', 'accepted-risk', 'incomplete', 'not-applicable']);
function validateShape(report) {
  if (!report || REQUIRED.some((key) => !(key in report)) || Object.keys(report).some((key) => !ALLOWED.has(key))) throw cliError('CLI_REPORT_INVALID');
  if (report.schema !== 'veilforge.report.v4' || report.schemaVersion !== '4.0.0' || report.reportVersion !== '4.0.0' || !Array.isArray(report.findings)) throw cliError('CLI_REPORT_INVALID');
  if (report.findings.some((finding) => !SEVERITY.has(finding.severity) || !DISPOSITION.has(finding.disposition))) throw cliError('CLI_REPORT_INVALID');
}
export async function verifyReportCommand(filename) {
  if (!filename) throw cliError('CLI_ARGUMENT_INVALID');
  try {
    const report = JSON.parse(await readFile(filename, 'utf8'));
    validateShape(report);
    const verification = verifyReport(report); return { ok: true, status: 'verified', exitCode: 0, reportHash: verification.reportHash, errors: [] };
  } catch (error) { if (error?.code === 'CLI_REPORT_INVALID') throw error; throw cliError('CLI_REPORT_INVALID', { causeCode: error?.code ?? null }); }
}
