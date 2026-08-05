import test from'node:test';import assert from'node:assert/strict';import{scanCase}from'./helpers.mjs';
test('negative corpus case produces verified no-finding report and export',async()=>{const result=await scanCase('PAY-NEG-001');assert.equal(result.report.summary.activeDetected,0);assert.equal(result.report.integrity.verified,true);assert.equal(result.verification.verified,true);});
