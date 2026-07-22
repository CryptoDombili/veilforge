import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compareReports, scanProject } from '../packages/analyzer/src/index.js';

const vulnerable = scanProject([{ path: 'Payroll.sol', content: fs.readFileSync(new URL('../examples/vulnerable-payroll/Payroll.sol', import.meta.url), 'utf8') }]);
const hardened = scanProject([{ path: 'PayrollPrivateReady.sol', content: fs.readFileSync(new URL('../examples/remediated-payroll/PayrollPrivateReady.sol', import.meta.url), 'utf8') }]);

test('comparison separates resolved, ongoing, and introduced findings', () => {
  const comparison = compareReports(vulnerable, hardened);
  assert.equal(comparison.resolved.length, vulnerable.findings.length);
  assert.equal(comparison.ongoing.length, 0);
  assert.equal(comparison.introduced.length, 0);
  assert.equal(comparison.scoreDelta, 100);
});

test('identical reports remain fully ongoing', () => {
  const comparison = compareReports(vulnerable, vulnerable);
  assert.equal(comparison.resolved.length, 0);
  assert.equal(comparison.introduced.length, 0);
  assert.equal(comparison.ongoing.length, vulnerable.findings.length);
});
