import { readFile } from 'node:fs/promises';
import { benchmarkError } from './errors.js';
const DOMAINS = new Set(['arc-payments','arc-treasury','arc-private-credit']); const KINDS = new Set(['positive','negative','adversarial']);
export function validateOracle(value) {
  if (!value || value.schemaVersion !== '1.0.0' || value.oracleVersion !== '1.0.0' || !Array.isArray(value.cases) || value.cases.length !== 60) throw benchmarkError('BENCHMARK_ORACLE_INVALID','Benchmark oracle header or coverage is invalid.');
  const ids = new Set();
  for (const item of value.cases) {
    if (!item?.caseId || ids.has(item.caseId) || !DOMAINS.has(item.domain) || !KINDS.has(item.kind) || !Array.isArray(item.expectedFindings) || !Array.isArray(item.expectedIncompleteReasons) || !Array.isArray(item.allowedAdditionalFindings)) throw benchmarkError('BENCHMARK_ORACLE_INVALID','Benchmark oracle case is invalid.',{caseId:item?.caseId??null});
    ids.add(item.caseId);
    for (const finding of item.expectedFindings) if (!finding.detectorId?.startsWith(`${item.domain}.`) || finding.category !== finding.detectorId.split('.').at(-1) || !finding.expectedPrimaryLocation?.sourcePath || /^(?:\/|[A-Za-z]:|file:)/u.test(finding.expectedPrimaryLocation.sourcePath) || finding.expectedPrimaryLocation.sourcePath.split('/').includes('..')) throw benchmarkError('BENCHMARK_ORACLE_INVALID','Benchmark finding identity or location is invalid.',{caseId:item.caseId});
  }
  return true;
}
export async function loadBenchmarkOracle(filename = 'benchmarks/v4/oracle.json') { let value; try { value=JSON.parse(await readFile(filename,'utf8')); } catch { throw benchmarkError('BENCHMARK_ORACLE_INVALID','Benchmark oracle could not be read.'); } validateOracle(value); return value; }
export function oracleCase(oracle, caseId) { const value=oracle.cases.find(item=>item.caseId===caseId); if(!value)throw benchmarkError('BENCHMARK_CASE_UNKNOWN','Unknown benchmark case.',{caseId}); return value; }
