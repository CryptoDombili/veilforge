import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateDeploymentEvidence, scanProject } from '../packages/analyzer/src/index.js';

const vulnerable = fs.readFileSync('examples/vulnerable-payroll/Payroll.sol', 'utf8');
const hardened = fs.readFileSync('examples/remediated-payroll/PayrollPrivateReady.sol', 'utf8');

test('Ascension layers are deterministic and source-bound', () => {
  const files = [{ path: 'Payroll.sol', content: vulnerable }];
  const first = scanProject(files);
  const second = scanProject(files);
  assert.deepEqual(first.privacyTwin, second.privacyTwin);
  assert.deepEqual(first.deploymentLineage, second.deploymentLineage);
  assert.deepEqual(first.privacyGate, second.privacyGate);
  assert.deepEqual(first.fuzzPlan, second.fuzzPlan);
  assert.match(first.privacyTwin.twinId, /^0x[0-9a-f]{64}$/);
  assert.equal(first.privacyTwin.availability.apsAvailable, false);
  assert.equal(first.privacyTwin.mode, 'aps-readiness-simulation');
  assert.equal(first.deploymentLineage.sourceHash, first.sourceHash);
  assert.equal(first.privacyPassport.lineageId, first.deploymentLineage.lineageId);
});

test('privacy gate blocks vulnerable source and passes hardened source', () => {
  const blocked = scanProject([{ path: 'Payroll.sol', content: vulnerable }]);
  const ready = scanProject([{ path: 'PayrollPrivateReady.sol', content: hardened }]);
  assert.equal(blocked.privacyGate.status, 'failed');
  assert.ok(blocked.privacyGate.failed > 0);
  assert.equal(ready.privacyGate.status, 'passed');
  assert.equal(ready.arcDeployRehearsal.status, 'Ready to rehearse');
  assert.match(ready.privacyGate.workflow, /--gate/);
});

test('domain rule packs and source-guided fuzz plan cover payroll surfaces', () => {
  const report = scanProject([{ path: 'Payroll.sol', content: vulnerable }]);
  assert.ok(report.rulePacks.some((pack) => pack.id === 'payroll'));
  assert.ok(report.rulePacks.some((pack) => pack.id === 'healthcare'));
  assert.ok(report.fuzzPlan.summary.campaigns > 0);
  assert.ok(report.fuzzPlan.summary.vectors >= report.fuzzPlan.summary.campaigns);
  assert.equal(report.fuzzPlan.executed, false);
});

test('living deployment evidence becomes linked or stale deterministically', () => {
  const report = scanProject([{ path: 'PayrollPrivateReady.sol', content: hardened }]);
  const evidence = {
    chainId: 5_042_002,
    sourceHash: report.sourceHash,
    contractAddress: `0x${'11'.repeat(20)}`,
    transactionHash: `0x${'22'.repeat(32)}`,
    bytecodeHash: `0x${'33'.repeat(32)}`,
  };
  const linked = evaluateDeploymentEvidence(report.deploymentLineage, evidence);
  assert.equal(linked.status, 'Evidence linked');
  assert.match(linked.attestationId, /^0x[0-9a-f]{64}$/);
  const stale = evaluateDeploymentEvidence(report.deploymentLineage, { ...evidence, sourceHash: `0x${'44'.repeat(32)}` });
  assert.equal(stale.status, 'Stale');
  assert.equal(stale.valid, false);
});

test('attack campaigns include source-evidence cinema frames', () => {
  const report = scanProject([{ path: 'Payroll.sol', content: vulnerable }]);
  assert.ok(report.attackLab.campaigns.every((campaign) => campaign.replay.frames.length === campaign.steps.length));
  assert.ok(report.attackLab.campaigns.every((campaign) => campaign.replay.mode === 'source-evidence-cinema'));
});
