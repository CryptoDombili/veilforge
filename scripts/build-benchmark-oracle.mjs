import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const manifest = JSON.parse(await readFile('tests/corpus/manifest.json', 'utf8'));
const categoryByLegacy = Object.freeze({
  'VF4-EVENT-DISCLOSURE': 'event-disclosure', 'VF4-CALLDATA-DISCLOSURE': 'calldata-observation',
  'VF4-RETURN-DISCLOSURE': 'return-disclosure', 'VF4-REVERT-DISCLOSURE': 'revert-disclosure',
  'VF4-EXTERNAL-CALL-DISCLOSURE': 'external-call-disclosure', 'VF4-METADATA-DISCLOSURE': 'metadata-disclosure',
});
const disposition = Object.freeze({ open: 'detected', 'approved-public': 'policy-approved', declassified: 'policy-approved', 'accepted-risk': 'accepted-risk' });
function expectation(domain, sourcePath, item, category, sinkClass = item.sink) {
  return { detectorId: `${domain}.${category}`, category, sourceClass: item.sourceClass, sinkClass, disposition: disposition[item.disposition] ?? item.disposition, minimumSeverity: 'informational', minimumConfidence: 'low', expectedOccurrenceCount: item.occurrenceCount, expectedPrimaryLocation: { sourcePath }, requiredEvidenceKinds: ['sink-location','source-location'], requiredTraceRoles: ['sink','source'], groupingExpectation: category.startsWith('public-') ? 'separate-by-detector-and-semantic-sink' : 'single-semantic-finding' };
}
const cases = [];
for (const entry of [...manifest.cases].sort((a,b)=>a.id.localeCompare(b.id))) {
  const expected = JSON.parse(await readFile(path.join(entry.path, 'expected.json'), 'utf8')); const compiler = JSON.parse(await readFile(path.join(entry.path, 'compiler.json'), 'utf8'));
  const expectedFindings = [];
  for (const item of expected.expectedFindings ?? []) {
    if (item.ruleId === 'VF4-PUBLIC-STORAGE') {
      expectedFindings.push(expectation(entry.domain, compiler.sourcePath, item, 'public-getter-disclosure', 'public-getter'));
      expectedFindings.push(expectation(entry.domain, compiler.sourcePath, item, 'public-storage-disclosure', 'public-storage'));
    } else expectedFindings.push(expectation(entry.domain, compiler.sourcePath, item, categoryByLegacy[item.ruleId]));
  }
  if (entry.id === 'CRD-ADV-001') {
    const item = { sourceClass: 'collateral', occurrenceCount: 1, disposition: 'open' };
    expectedFindings.push(expectation(entry.domain, compiler.sourcePath, item, 'public-getter-disclosure', 'public-getter'));
    expectedFindings.push(expectation(entry.domain, compiler.sourcePath, item, 'public-storage-disclosure', 'public-storage'));
  }
  const compileDisposition = expected.analysisStatus === 'compile-error' ? 'compiler-error' : expected.analysisStatus === 'unsupported-compiler' ? 'unsupported-compiler' : entry.id === 'CRD-ADV-004' ? 'input-invalid' : 'compiled';
  const analysisStatus = expected.analysisStatus === 'analysis-incomplete' ? 'incomplete' : expected.analysisStatus === 'compile-error' ? 'compiler-error' : expected.analysisStatus === 'unsupported-compiler' ? 'unsupported' : 'supported';
  const reasons = entry.id === 'CRD-ADV-001' ? ['inline-assembly-not-modeled'] : entry.id === 'CRD-ADV-004' ? ['source-input-invalid'] : [];
  const known = ['PAY-POS-001','TRE-POS-001','CRD-POS-001'].includes(entry.id) ? 'Public storage and generated getter are separate normative detector occurrences.' : entry.id === 'CRD-ADV-001' ? 'Public storage/getter findings remain visible while inline assembly analysis is explicitly incomplete.' : undefined;
  cases.push({ caseId: entry.id, domain: entry.domain, kind: entry.classification, compileDisposition, analysisStatus, expectedFindings: expectedFindings.sort((a,b)=>a.detectorId.localeCompare(b.detectorId)), expectedIncompleteReasons: reasons, allowedAdditionalFindings: [], ...(known ? { notes: known } : {}) });
}
const oracle = { schemaVersion: '1.0.0', oracleVersion: '1.0.0', candidateVersion: manifest.candidateVersion, cases };
await mkdir('benchmarks/v4', { recursive: true }); await writeFile('benchmarks/v4/oracle.json', `${JSON.stringify(oracle, null, 2)}\n`);
process.stdout.write(`Wrote benchmark oracle for ${cases.length} cases.\n`);
