import test from 'node:test';import assert from 'node:assert/strict';import{detectorResult,findings}from'./helpers.mjs';
test('KYC to event is narrowly critical eligible with complete high-confidence evidence',()=>assert.equal(findings(detectorResult()).findings[0].severity,'critical'));
test('amount to event is never critical',()=>assert.equal(findings(detectorResult({dataClass:'amount'})).findings[0].severity,'medium'));
test('KYC to public getter is critical eligible',()=>assert.equal(findings(detectorResult({detectorId:'arc-payments.public-getter-disclosure',sinkClass:'public-storage-getter'})).findings[0].severity,'critical'));
test('treasury balance to public storage is medium',()=>assert.equal(findings(detectorResult({domain:'arc-treasury',detectorId:'arc-treasury.public-storage-disclosure',sinkClass:'public-storage-getter',dataClass:'amount'})).findings[0].severity,'medium'));
