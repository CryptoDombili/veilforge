import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePolicyManifest, scanProject } from '../packages/analyzer/src/index.js';

function source(file) {
  const filePath = file instanceof URL ? fileURLToPath(file) : file;
  return { path: path.basename(filePath), content: fs.readFileSync(filePath, 'utf8') };
}


const vulnerablePath = new URL('../examples/vulnerable-payroll/Payroll.sol', import.meta.url);
const hardenedPath = new URL('../examples/remediated-payroll/PayrollPrivateReady.sol', import.meta.url);

test('same source produces the same canonical report', () => {
  const files = [source(vulnerablePath)];
  const first = scanProject(files);
  const second = scanProject(files);
  assert.deepEqual(first, second);
  assert.equal(first.status, 'Deployment Blocked');
  assert.equal(first.score, 0);
  assert.match(first.sourceHash, /^0x[0-9a-f]{64}$/);
  assert.match(first.reportHash, /^0x[0-9a-f]{64}$/);
  assert.ok(first.findings.some((finding) => finding.ruleId === 'VF010'));
  assert.ok(first.findings.some((finding) => finding.ruleId === 'VF008' && finding.evidence.includes('salaryOf') && finding.startLine === 10));
  assert.ok(first.findings.some((finding) => finding.ruleId === 'VF009' && finding.functionName === 'setEmployeeSalary' && finding.startLine === 24));
  assert.ok(first.exposureChains.every((chain) => chain.nodes.map((node) => node.type).join('>') === 'Storage>Function>Event>Selector>Policy'));
});

test('hardened example improves readiness and has no deterministic findings', () => {
  const vulnerable = scanProject([source(vulnerablePath)]);
  const hardened = scanProject([source(hardenedPath)]);
  assert.equal(hardened.status, 'Ready');
  assert.equal(hardened.score, 100);
  assert.equal(hardened.findings.length, 0);
  assert.ok(hardened.score > vulnerable.score);
});

test('multi-file scan creates contract-level triage', () => {
  const directory = new URL('../examples/multi-contract/', import.meta.url);
  const files = fs.readdirSync(directory)
    .filter((name) => name.endsWith('.sol'))
    .sort()
    .map((name) => ({ path: `contracts/${name}`, content: fs.readFileSync(new URL(name, directory), 'utf8') }));
  const report = scanProject(files);
  assert.equal(report.files.length, 2);
  assert.equal(report.contracts.length, 2);
  assert.ok(report.contracts.some((contract) => contract.name === 'PayrollMission' && contract.status === 'Deployment Blocked'));
  assert.ok(report.policies.length >= 5);
});

test('custom rules plug into the same canonical engine', () => {
  const customRule = {
    id: 'CUSTOM001',
    title: 'Forbidden marker',
    severity: 'low',
    detect({ parsedFiles }) {
      return parsedFiles.flatMap((parsed) => parsed.source.content.includes('pragma') ? [{
        file: parsed.source.path,
        contractName: parsed.contracts[0]?.name ?? 'Global',
        startLine: 2,
        evidence: 'pragma solidity',
        impact: 'Example custom rule impact.',
        remediation: 'Example custom rule treatment.',
      }] : []);
    },
  };
  const report = scanProject([source(hardenedPath)], { customRules: [customRule] });
  assert.ok(report.findings.some((finding) => finding.ruleId === 'CUSTOM001' && finding.customRule));
  assert.equal(report.engine.ruleCount, 13);
});

test('policy manifest is derived from the canonical report', () => {
  const report = scanProject([source(hardenedPath)]);
  const manifest = generatePolicyManifest(report);
  assert.equal(manifest.reportHash, report.reportHash);
  assert.equal(manifest.sourceHash, report.sourceHash);
  assert.equal(manifest.policies.length, report.policies.length);
  assert.ok(manifest.policies.every((policy) => /^0x[0-9a-f]{8}$/.test(policy.selector)));
});

test('v3.2 privacy operating system layers are deterministic and source-bound', () => {
  const report = scanProject([source(vulnerablePath)]);
  assert.equal(report.schemaVersion, '3.2');
  assert.equal(report.scannerVersion, '3.2.2');
  assert.ok(report.privacyGenome.metrics.sensitiveAssets > 0);
  assert.ok(report.privacyGenome.graph.nodes.length > 0);
  assert.ok(report.privacyGenome.graph.edges.length > 0);
  assert.ok(report.privacyIntent.document.includes('require_deployment_lineage: true'));
  assert.equal(report.attackLab.summary.attempts, report.findings.length);
  assert.equal(report.attackLab.summary.mapped, report.findings.length);
  assert.equal(report.transactionMRI.traces.length, report.findings.length);
  assert.equal(report.forgePlan.summary.total, report.findings.length);
  assert.equal(report.privacyPassport.sourceHash, report.sourceHash);
  assert.match(report.privacyPassport.passportId, /^0x[0-9a-f]{64}$/);
  assert.equal(report.privacyTwin.sourceHash, report.sourceHash);
  assert.equal(report.deploymentLineage.sourceHash, report.sourceHash);
  assert.equal(report.arcDeployRehearsal.twinId, report.privacyTwin.twinId);
  assert.ok(report.engine.capabilities.includes('privacy-ci-gate'));
});

test('declared privacy intent changes policy compliance without changing the source hash', () => {
  const files = [{ path: 'Intent.sol', content: 'pragma solidity ^0.8.24; contract Intent { uint256 public salary; }' }];
  const strict = scanProject(files, { declaredIntent: { defaults: { publicObserver: 'denied', externalContract: 'denied', recordOwner: 'allowed' } } });
  const permissive = scanProject(files, { declaredIntent: { defaults: { publicObserver: 'allowed', externalContract: 'allowed', recordOwner: 'allowed' } } });
  assert.equal(strict.sourceHash, permissive.sourceHash);
  assert.notEqual(strict.reportHash, permissive.reportHash);
  assert.ok(strict.privacyIntent.violations.length > permissive.privacyIntent.violations.length);
  assert.equal(permissive.privacyIntent.declarationSource, 'user-declared');
  assert.match(permissive.privacyIntent.document, /public_observer: allowed/);
});

test('hardened example earns an active privacy passport', () => {
  const report = scanProject([source(hardenedPath)]);
  assert.equal(report.attackLab.summary.mapped, 0);
  assert.equal(report.privacyIntent.complianceScore, 100);
  assert.equal(report.privacyPassport.status, 'Active');
  assert.equal(report.privacyPassport.deploymentGate, 'Source checks passed');
});
