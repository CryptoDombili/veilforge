import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { baseArgs, capture, fixture } from '../cli/helpers.mjs';
import { verifySarif } from '../../../packages/sarif/src/index.js';

const gateConfig = { schemaVersion: '1.0.0', failOnSeverity: ['critical', 'high'], minimumConfidence: 'low', includedDomains: [], includedCategories: [], excludedRuleIds: [], dispositions: ['detected'], failOnIncomplete: true, failOnInvalidPolicy: true, maxActiveFindings: null, maxFindingsBySeverity: {}, baseline: null };
test('CLI writes SARIF and gate JSON while retaining a verifiable export', async () => {
  const f = await fixture('pragma solidity 0.8.24; contract Tiny { event Leaked(uint256 value); function leak(uint256 accountBalance) external { emit Leaked(accountBalance); } }');
  try {
    const config = path.join(f.root, 'gate.json'); await writeFile(config, JSON.stringify(gateConfig));
    const scan = await capture([...baseArgs(f.output), '--sarif', '--gate-config', config, '--gate-json'], f.root); assert.ok([0, 12].includes(scan.exitCode), scan.stderr);
    const summary = JSON.parse(scan.stdout); const sarifText = await readFile(path.join(f.output, 'veilforge-results-v4.sarif'), 'utf8'); verifySarif(JSON.parse(sarifText), { reportHash: summary.reportHash, canonicalBytes: sarifText });
    assert.equal(JSON.parse(await readFile(path.join(f.output, 'veilforge-gate-result-v4.json'), 'utf8')).reportHash, summary.reportHash);
    assert.equal((await capture(['verify-export', f.output, '--json'])).exitCode, 0);
    const byReport = await capture(['gate', '--report', path.join(f.output, 'veilforge-report-v4.json'), '--config', config, '--json']);
    const byExport = await capture(['gate', '--export', f.output, '--config', config, '--json']); assert.equal(byReport.exitCode, byExport.exitCode); assert.equal(JSON.parse(byReport.stdout).gate.deterministicSummary, JSON.parse(byExport.stdout).gate.deterministicSummary);
  } finally { await f.cleanup(); }
});
