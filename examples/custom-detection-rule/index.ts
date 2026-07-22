import { scanSources, type CustomDetectionRule, type SourceFile } from '@veilforge/scanner';

const medicalMemoRule: CustomDetectionRule = {
  id: 'VF_CUSTOM_MEDICAL_MEMO',
  title: 'Medical memo emitted in a public log',
  description: 'The project-specific medical memo field appears in an event emission.',
  severity: 'high',
  category: 'event-disclosure',
  confidence: 'high',
  impact: 'The memo can become permanent and indexable public metadata.',
  remediation: 'Emit a commitment or non-sensitive status instead of the memo.',
  suggestedPolicy: 'Locked',
  matches: ({ line }) => /emit\s+\w+\([^;]*medicalMemo/i.test(line),
};

const files: SourceFile[] = [{
  path: 'Benefits.sol',
  content: `pragma solidity ^0.8.24;
contract Benefits {
  event Synced(address employee, string medicalMemo);
  function sync(address employee, string calldata medicalMemo) external {
    emit Synced(employee, medicalMemo);
  }
}`,
}];

const report = scanSources(files, { customRules: [medicalMemoRule] });
console.log(report.findings.filter((finding) => finding.ruleId === medicalMemoRule.id));
