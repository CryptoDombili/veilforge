import test from'node:test';import assert from'node:assert/strict';import{projection}from'./helpers.mjs';
test('Payments event remediation removes raw event data',()=>assert.ok(projection().remediationSteps.some(x=>x.includes('event arguments'))));
test('Payments metadata remediation recommends opaque off-chain reference',()=>assert.ok(projection({detectorId:'arc-payments.metadata-disclosure',sinkClass:'metadata-uri'}).remediationSteps.some(x=>x.includes('opaque off-chain reference'))));
test('Payments calldata guidance reviews unnecessary API input',()=>assert.ok(projection({detectorId:'arc-payments.calldata-observation',sinkClass:'calldata'}).remediationSteps.some(x=>x.includes('public calldata'))));
