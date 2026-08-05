import test from'node:test';import assert from'node:assert/strict';import{context,report}from'./helpers.mjs';import{buildReport}from'../../../packages/analyzer/src/v4/report/index.js';
test('report summary agrees with findings',()=>{const r=report();assert.equal(r.summary.totalFindings,r.findings.length);assert.equal(r.summary.groupedFindings,r.findings.length);});
test('summary mismatch raises structured consistency error',()=>{const c=context();c.findingRun.summary.total=99;assert.throws(()=>buildReport(c),e=>e.code==='REPORT_CONSISTENCY_ERROR');});
