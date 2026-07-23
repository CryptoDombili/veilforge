import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatMarkdownReport,
  generatePolicyManifest,
  scanProject,
} from '../packages/analyzer/src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.join(here, 'multi-contract');
const files = fs.readdirSync(projectDirectory)
  .filter((name) => name.endsWith('.sol'))
  .sort()
  .map((name) => ({
    path: name,
    content: fs.readFileSync(path.join(projectDirectory, name), 'utf8'),
  }));

const report = scanProject(files);
const policyManifest = generatePolicyManifest(report);

console.log(JSON.stringify({
  status: report.status,
  score: report.score,
  sourceHash: report.sourceHash,
  reportHash: report.reportHash,
  contracts: report.contracts.map(({ name, status, score }) => ({ name, status, score })),
  policyCount: policyManifest.policies.length,
}, null, 2));

if (process.argv.includes('--write')) {
  fs.writeFileSync(path.join(here, 'programmatic-report.md'), formatMarkdownReport(report));
  fs.writeFileSync(path.join(here, 'programmatic-policy-manifest.json'), `${JSON.stringify(policyManifest, null, 2)}\n`);
}
