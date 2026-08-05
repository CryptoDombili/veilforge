import test from'node:test';import assert from'node:assert/strict';import{detectorResult,findings}from'./helpers.mjs';
test('approved wrapper remains visible as policy-approved',()=>{const run=findings(detectorResult({disposition:'policy-approved',declassificationDecisionId:'decision-1',policyRuleId:'wrapper-1'}));assert.equal(run.findings[0].disposition,'policy-approved');assert.equal(run.findings.length,1);});
test('public field remains visible as policy-approved',()=>assert.equal(findings(detectorResult({disposition:'policy-approved',policyRuleId:'field-1'})).summary.policyApproved,1));
test('plain keccak stays actively detected',()=>assert.equal(findings(detectorResult({declassificationDecisionId:'plain-keccak-rejected'})).summary.activeDetected,1));
