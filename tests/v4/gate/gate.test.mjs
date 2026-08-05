import test from 'node:test';
import assert from 'node:assert/strict';
import { report } from '../report/helpers.mjs';
import { detectorResult, findings } from '../findings/helpers.mjs';
import { projectFindingRun } from '../../../packages/analyzer/src/v4/presentation/index.js';
import { evaluateGate, getGateExitCode, loadGateConfig } from '../../../packages/gate/src/index.js';

test('safe defaults fail detected high findings with exit code 12', async () => { const result = await evaluateGate(report()); assert.equal(result.status, 'failed'); assert.equal(result.counts.active, 1); assert.equal(getGateExitCode(result), 12); });
test('severity, domain, category, confidence, disposition and exclusions are enforced', async () => {
  const source = report(); const fingerprint = source.findings[0].fingerprint;
  assert.equal((await evaluateGate(source, { failOnSeverity: ['critical'] })).passed, false);
  assert.equal((await evaluateGate(source, { includedDomains: ['arc-treasury'] })).passed, true);
  assert.equal((await evaluateGate(source, { includedCategories: ['other'] })).passed, true);
  assert.equal((await evaluateGate(source, { minimumConfidence: 'high', excludedRuleIds: ['arc-payments.event-disclosure'] })).passed, true);
  assert.equal((await evaluateGate(source, { dispositions: ['accepted-risk'] })).passed, true);
});
test('invalid config is rejected deterministically', async () => { await assert.rejects(loadGateConfig({ unknown: true }), { code: 'GATE_CONFIG_INVALID' }); await assert.rejects(loadGateConfig({ failOnSeverity: ['urgent'] }), { code: 'GATE_CONFIG_INVALID' }); });
test('accepted risk is visible and passes safe defaults', async () => { const findingRun = findings(detectorResult({ token: 'gate-risk', disposition: 'accepted-risk', acceptedRiskId: 'risk-1' })); const result = await evaluateGate(report({ findingRun, presentationRun: projectFindingRun(findingRun) })); assert.equal(result.passed, true); assert.equal(result.visibleFindings[0].disposition, 'accepted-risk'); assert.equal(result.counts.byDisposition['accepted-risk'], 1); });
