import test from'node:test';import assert from'node:assert/strict';import{detectorResult,findings}from'./helpers.mjs';
test('borrower-specific interest rate public return is medium',()=>assert.equal(findings(detectorResult({domain:'arc-private-credit',detectorId:'arc-private-credit.return-disclosure',sinkClass:'return',dataClass:'interest-rate'})).findings[0].severity,'medium'));
test('generic protocol interest rate absent from detector results creates no finding',()=>assert.equal(findings([]).findings.length,0));
test('sensitive custom error has contextual medium severity',()=>assert.equal(findings(detectorResult({detectorId:'arc-payments.revert-disclosure',sinkClass:'revert-custom-error'})).findings[0].severity,'medium'));
