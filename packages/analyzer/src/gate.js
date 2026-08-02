import { stableFingerprint } from './canonical.js';

const PACKS = Object.freeze([
  { id: 'core-privacy', label: 'Core Privacy', terms: [], controls: ['least privilege', 'revert sanitization', 'source lineage'] },
  { id: 'payroll', label: 'Private Payroll', terms: ['payroll', 'salary', 'employee', 'beneficiary'], controls: ['salary confidentiality', 'employee unlinkability', 'restricted payout mutation'] },
  { id: 'rwa', label: 'RWA & Compliance', terms: ['kyc', 'allowlist', 'whitelist', 'asset', 'investor'], controls: ['identity minimization', 'revocable authorization', 'compliance boundary'] },
  { id: 'stablecoin', label: 'Stablecoin', terms: ['mint', 'burn', 'stablecoin', 'issuer'], controls: ['issuer least privilege', 'supply mutation guard', 'transfer metadata review'] },
  { id: 'treasury', label: 'Treasury', terms: ['treasury', 'approver', 'guardian', 'limit'], controls: ['multi-party authorization', 'spend limit privacy', 'recipient protection'] },
  { id: 'healthcare', label: 'Healthcare', terms: ['medical', 'patient', 'diagnosis', 'healthcare'], controls: ['record confidentiality', 'subject access', 'auditable revocation'] },
  { id: 'agent-payments', label: 'Agent Payments', terms: ['agent', 'job', 'escrow', 'settlement'], controls: ['agent identity boundary', 'deliverable minimization', 'settlement confidentiality'] },
]);

export function buildRulePackSelection(files) {
  const source = files.map((file) => file.content).join('\n').toLowerCase();
  return PACKS.filter((pack) => pack.id === 'core-privacy' || pack.terms.some((term) => source.includes(term))).map((pack) => ({
    id: pack.id,
    label: pack.label,
    status: 'active',
    matchedTerms: pack.terms.filter((term) => source.includes(term)),
    controls: [...pack.controls],
  }));
}

function workflowDocument() {
  return [
    'name: VeilForge Privacy Gate',
    'on:',
    '  pull_request:',
    '  push:',
    '    branches: [main]',
    'permissions:',
    '  contents: read',
    'jobs:',
    '  privacy-gate:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - uses: actions/setup-node@v4',
    '        with:',
    '          node-version: 22',
    '          cache: npm',
    '      - run: npm ci',
    '      - run: npm test',
    '      - name: Run deterministic privacy gate',
    '        run: node packages/analyzer/cli.mjs scan contracts --format json --output veilforge-report.json --gate',
    '      - uses: actions/upload-artifact@v4',
    '        if: always()',
    '        with:',
    '          name: veilforge-privacy-report',
    '          path: veilforge-report.json',
    '',
  ].join('\n');
}

export function buildPrivacyGate({ summary, intent, attackLab, lineage, rulePacks }) {
  const checks = [
    { id: 'critical', label: 'Critical findings', expected: 0, actual: summary.critical, pass: summary.critical === 0 },
    { id: 'high', label: 'High findings', expected: 0, actual: summary.high, pass: summary.high === 0 },
    { id: 'intent', label: 'Intent compliance', expected: 90, actual: intent.complianceScore, pass: intent.complianceScore >= 90 },
    { id: 'attack', label: 'Mapped attack paths', expected: 0, actual: attackLab.summary.mapped, pass: attackLab.summary.mapped === 0 },
    { id: 'lineage', label: 'Lineage artifact', expected: 1, actual: lineage.lineageId ? 1 : 0, pass: Boolean(lineage.lineageId) },
    { id: 'packs', label: 'Active rule packs', expected: 1, actual: rulePacks.length, pass: rulePacks.length > 0 },
  ];
  const failed = checks.filter((check) => !check.pass).length;
  return {
    version: '1.0',
    gateId: stableFingerprint(['privacy-ci-gate', lineage.lineageId, ...checks.flatMap((check) => [check.id, check.actual, check.pass])]),
    status: failed === 0 ? 'passed' : 'failed',
    failed,
    checks,
    workflowPath: '.github/workflows/veilforge-privacy-gate.yml',
    workflow: workflowDocument(),
  };
}
