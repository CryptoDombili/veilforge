import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { applyForgeCandidates, scanProject } from '../packages/analyzer/src/index.js';

const vulnerable = fs.readFileSync('examples/vulnerable-payroll/Payroll.sol', 'utf8');

test('Forge candidates apply deterministic narrow source transformations', () => {
  const files = [{ path: 'Payroll.sol', content: vulnerable }];
  const report = scanProject(files);
  const first = applyForgeCandidates(files, report.forgePlan);
  const second = applyForgeCandidates(files, report.forgePlan);
  assert.deepEqual(first, second);
  assert.ok(first.applied.length >= 1);
  assert.match(first.files[0].content, /mapping\(address => uint256\) private salaryOf/);
  assert.match(first.files[0].content, /return tx\.origin == owner/);
  assert.ok(report.forgePlan.patches.some((patch) => patch.ruleId === 'VF010' && !patch.supported));
  assert.equal(files[0].content, vulnerable, 'input source must remain unchanged');
});

test('Forge plan refuses unsafe generic automatic mutations', () => {
  const report = scanProject([{ path: 'Payroll.sol', content: vulnerable }]);
  assert.ok(report.forgePlan.patches.some((patch) => patch.supported));
  assert.ok(report.forgePlan.patches.some((patch) => !patch.supported && patch.status === 'Engineering review'));
});

test('Forge applies a candidate only to its source-anchored line', () => {
  const before = 'uint256 public salary;';
  const files = [{ path: 'Payroll.sol', content: `contract Payroll {\n  ${before}\n  ${before}\n}\n` }];
  const forgePlan = {
    patches: [{
      id: 'anchored-patch', ruleId: 'VF001', file: 'Payroll.sol', line: 3,
      supported: true, before, after: 'uint256 private salary;', transformation: 'visibility-hardening',
    }],
  };
  const result = applyForgeCandidates(files, forgePlan);
  assert.equal(result.applied.length, 1);
  assert.equal(result.files[0].content, `contract Payroll {\n  ${before}\n  uint256 private salary;\n}\n`);
});
