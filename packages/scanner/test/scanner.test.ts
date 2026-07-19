import { describe, expect, it } from 'vitest';
import { canonicalReportHash, canonicalSourceHash, formatMarkdownReport, scanSources } from '../src/index.js';
import type { SourceFile } from '../src/types.js';

const wrap = (body: string): SourceFile => ({
  path: 'Fixture.sol',
  content: `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.24;\ncontract Fixture {\n${body}\n}`,
});

function rulesFor(source: SourceFile): string[] {
  return scanSources([source]).findings.map((item) => item.ruleId);
}

describe('VeilForge deterministic scanner', () => {
  it('detects VF001 sensitive public state', () => {
    expect(rulesFor(wrap('uint256 public salary;'))).toContain('VF001');
  });

  it('does not flag VF001 for private sensitive state', () => {
    expect(rulesFor(wrap('uint256 private salary;'))).not.toContain('VF001');
  });

  it('detects VF002 sensitive event schemas', () => {
    expect(rulesFor(wrap('event SalaryPaid(address employee, uint256 amount);'))).toContain('VF002');
  });

  it('does not flag VF002 for non-sensitive status events', () => {
    expect(rulesFor(wrap('event VersionPublished(bytes32 releaseHash);'))).not.toContain('VF002');
  });

  it('detects VF003 sensitive revert strings', () => {
    expect(
      rulesFor(wrap('function f() external pure { require(false, "employee salary missing"); }')),
    ).toContain('VF003');
  });

  it('does not flag VF003 for opaque custom errors', () => {
    expect(rulesFor(wrap('error Missing(); function f() external pure { revert Missing(); }'))).not.toContain(
      'VF003',
    );
  });

  it('detects VF004 unguarded sensitive reads', () => {
    expect(
      rulesFor(wrap('mapping(address => uint256) private salary; function getSalary(address user) external view returns (uint256) { return salary[user]; }')),
    ).toContain('VF004');
  });

  it('does not flag VF004 when a common access-control modifier is present', () => {
    expect(
      rulesFor(
        wrap('mapping(address => uint256) private salary; modifier onlyOwner(){_;} function getSalary(address user) external view onlyOwner returns (uint256) { return salary[user]; }'),
      ),
    ).not.toContain('VF004');
  });

  it('detects VF005 unguarded sensitive writes', () => {
    expect(
      rulesFor(wrap('mapping(address => uint256) private salary; function setSalary(address user, uint256 amount) external { salary[user] = amount; }')),
    ).toContain('VF005');
  });

  it('does not flag VF005 for guarded writes', () => {
    expect(
      rulesFor(
        wrap('mapping(address => uint256) private salary; modifier onlyOwner(){_;} function setSalary(address user, uint256 amount) external onlyOwner { salary[user] = amount; }'),
      ),
    ).not.toContain('VF005');
  });

  it('detects VF006 delegatecall', () => {
    expect(
      rulesFor(wrap('function run(address target, bytes calldata data) external { target.delegatecall(data); }')),
    ).toContain('VF006');
  });

  it('does not flag VF006 for typed internal calls', () => {
    expect(rulesFor(wrap('function a() public {} function b() external { a(); }'))).not.toContain('VF006');
  });

  it('detects VF007 sensitive cross-contract calls', () => {
    expect(
      rulesFor({
        path: 'CrossContract.sol',
        content: `pragma solidity ^0.8.24;
interface I { function syncSalary(uint256 salary) external; }
contract Fixture {
  function sync(address provider, uint256 salary) external { I(provider).syncSalary(salary); }
}`,
      }),
    ).toContain('VF007');
  });

  it('detects VF008 public mappings', () => {
    expect(rulesFor(wrap('mapping(address => bytes32) public records;'))).toContain('VF008');
  });

  it('does not flag VF008 for private mappings', () => {
    expect(rulesFor(wrap('mapping(address => bytes32) private records;'))).not.toContain('VF008');
  });

  it('detects VF009 unrestricted administrative mutations', () => {
    expect(rulesFor(wrap('address private admin; function setAdmin(address next) external { admin = next; }'))).toContain(
      'VF009',
    );
  });

  it('detects VF010 tx.origin', () => {
    expect(rulesFor(wrap('function ok() external view returns (bool) { return tx.origin == address(1); }'))).toContain(
      'VF010',
    );
  });

  it('detects VF011 sensitive event emissions', () => {
    expect(
      rulesFor(wrap('event Paid(uint256 value); function f(uint256 salary) external { emit Paid(salary); }')),
    ).toContain('VF011');
  });

  it('detects VF012 sensitive dynamic calldata', () => {
    expect(rulesFor(wrap('function submitInvoice(string calldata invoice) external {}'))).toContain('VF012');
  });


  it('recognizes project-specific only* authorization modifiers', () => {
    expect(
      rulesFor(
        wrap('mapping(address => uint256) private salary; modifier onlyPayrollAdmin(){_;} function setSalary(address user, uint256 amount) external onlyPayrollAdmin { salary[user] = amount; }'),
      ),
    ).not.toContain('VF005');
  });

  it('adds deterministic remediation intelligence to findings', () => {
    const finding = scanSources([wrap('mapping(address => uint256) public salary;')]).findings[0];
    expect(finding?.impact).toBeTruthy();
    expect(finding?.suggestedPolicy).toBe('Restricted');
    expect(finding?.saferPattern).toContain('private');
  });

  it('summarizes the public exposure surface', () => {
    const report = scanSources([
      wrap('mapping(address => uint256) public salary; function getSalary(address user) external view returns (uint256) { return salary[user]; }'),
    ]);
    expect(report.exposure.publicMappings).toBe(1);
    expect(report.exposure.externallyCallableFunctions).toBe(1);
    expect(report.exposure.sensitiveSelectors).toBeGreaterThan(0);
  });

  it('exports an actionable Markdown remediation report', () => {
    const report = scanSources([wrap('mapping(address => uint256) public salary;')]);
    const markdown = formatMarkdownReport(report, 'Payroll');
    expect(markdown).toContain('VeilForge Privacy Readiness Report');
    expect(markdown).toContain('Recommended remediation');
    expect(markdown).toContain(report.reportHash);
  });

  it('produces higher readiness for a remediated design', () => {
    const vulnerable = scanSources([
      wrap('mapping(address => uint256) public salary; function setSalary(address user, uint256 amount) external { salary[user] = amount; }'),
    ]);
    const safer = scanSources([
      wrap('mapping(address => uint256) private salary; modifier onlyOwner(){_;} function setSalary(address user, uint256 amount) external onlyOwner { salary[user] = amount; }'),
    ]);
    expect(safer.score).toBeGreaterThan(vulnerable.score);
  });
});

describe('canonical hashing', () => {
  it('normalizes Windows and Unix line endings', () => {
    const a = canonicalSourceHash([{ path: 'A.sol', content: 'a\r\nb\r\n' }]);
    const b = canonicalSourceHash([{ path: 'A.sol', content: 'a\nb\n' }]);
    expect(a).toBe(b);
  });

  it('sorts file paths deterministically', () => {
    const first = canonicalSourceHash([
      { path: 'B.sol', content: 'b' },
      { path: 'A.sol', content: 'a' },
    ]);
    const second = canonicalSourceHash([
      { path: 'A.sol', content: 'a' },
      { path: 'B.sol', content: 'b' },
    ]);
    expect(first).toBe(second);
  });

  it('changes source hash when source changes', () => {
    expect(canonicalSourceHash([{ path: 'A.sol', content: 'a' }])).not.toBe(
      canonicalSourceHash([{ path: 'A.sol', content: 'b' }]),
    );
  });

  it('produces a stable report hash', () => {
    const report = scanSources([wrap('uint256 private value;')]);
    expect(canonicalReportHash(report)).toBe(report.reportHash);
  });
});
