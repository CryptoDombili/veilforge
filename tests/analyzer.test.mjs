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
