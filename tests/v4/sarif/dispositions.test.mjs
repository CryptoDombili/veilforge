import test from 'node:test';
import assert from 'node:assert/strict';
import { detectorResult, findings } from '../findings/helpers.mjs';
import { projectFindingRun } from '../../../packages/analyzer/src/v4/presentation/index.js';
import { report } from '../report/helpers.mjs';
import { renderSarif } from '../../../packages/sarif/src/index.js';

function dispositionReport(disposition, extra = {}) { const findingRun = findings(detectorResult({ token: `sarif-${disposition}`, disposition, ...extra })); return report({ findingRun, presentationRun: projectFindingRun(findingRun) }); }
test('accepted risk and policy approved findings remain visible as suppressions', () => { for (const disposition of ['accepted-risk', 'policy-approved']) { const result = renderSarif(dispositionReport(disposition, disposition === 'accepted-risk' ? { acceptedRiskId: 'risk-1' } : { policyRuleId: 'policy-1' })).runs[0].results[0]; assert.equal(result.properties.disposition, disposition); assert.equal(result.suppressions[0].status, 'accepted'); assert.equal(result.fixes, undefined); } });
test('incomplete remains visible and not-applicable is omitted', () => { const incomplete = renderSarif(dispositionReport('incomplete', { complete: false, incompleteReasons: ['unsupported-expression'] })).runs[0].results; assert.equal(incomplete.length, 1); assert.equal(incomplete[0].properties.complete, false); assert.equal(renderSarif(dispositionReport('not-applicable')).runs[0].results.length, 0); });
