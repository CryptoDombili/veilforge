import test from'node:test';import assert from'node:assert/strict';import{clone,report}from'./helpers.mjs';import{verifyReportIntegrity}from'../../../packages/analyzer/src/v4/report/index.js';
test('integrity verification succeeds for built report',()=>assert.equal(verifyReportIntegrity(report()),true));
test('tampered finding fails verification',()=>{const r=clone(report());r.findings[0].severity='low';assert.equal(verifyReportIntegrity(r),false);});
test('failed verification updates the verified flag',()=>{const r=clone(report());r.integrity.canonicalByteLength+=1;assert.equal(verifyReportIntegrity(r),false);assert.equal(r.integrity.verified,false);});
test('tampered policy fails verification',()=>{const r=clone(report());r.policy.policyDigest='sha256:'+ '1'.repeat(64);assert.equal(verifyReportIntegrity(r),false);});
test('tampered integrity hash fails verification and can throw',()=>{const r=clone(report());r.integrity.reportHash='sha256:'+ '2'.repeat(64);assert.equal(verifyReportIntegrity(r),false);assert.throws(()=>verifyReportIntegrity(r,{throwOnMismatch:true}),e=>e.code==='REPORT_INTEGRITY_MISMATCH');});
