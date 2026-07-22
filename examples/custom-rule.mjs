import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../packages/analyzer/src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(here, 'vulnerable-payroll', 'Payroll.sol');
const files = [{
  path: 'Payroll.sol',
  content: fs.readFileSync(sourcePath, 'utf8'),
}];

const organizationRule = {
  id: 'TEAM001',
  title: 'Organization-specific deprecated privacy flow',
  severity: 'medium',
  category: 'organization-policy',
  impact: 'A deprecated privacy marker remains in a source bundle governed by the organization policy.',
  remediation: 'Remove the marker or migrate the flow to the approved privacy implementation.',
  suggestedPolicy: 'Locked',
  confidence: 'high',
  detect({ parsedFiles }) {
    return parsedFiles.flatMap((parsed) => {
      const line = parsed.source.content.split('\n').findIndex((value) => value.includes('salaryOf')) + 1;
      if (line < 1) return [];
      return [{
        file: parsed.source.path,
        contractName: parsed.contracts.find((contract) => line >= contract.startLine && line <= contract.endLine)?.name ?? 'Global',
        startLine: line,
        endLine: line,
        evidence: parsed.source.content.split('\n')[line - 1].trim(),
      }];
    });
  },
};

const first = scanProject(files, { customRules: [organizationRule] });
const second = scanProject(files, { customRules: [organizationRule] });
const customFindings = first.findings.filter((finding) => finding.customRule);

if (first.reportHash !== second.reportHash) {
  throw new Error('Custom-rule scan was not deterministic.');
}

console.log(JSON.stringify({
  reportHash: first.reportHash,
  deterministic: true,
  customFindings,
}, null, 2));
