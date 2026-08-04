import test from'node:test';import assert from'node:assert/strict';import{clone,report}from'./helpers.mjs';import{validateReport}from'../../../packages/analyzer/src/v4/report/index.js';
test('schema required fields are enforced',()=>{const r=clone(report());delete r.compiler;assert.throws(()=>validateReport(r),e=>e.code==='REPORT_SCHEMA_INVALID');});
test('invalid finding enum is rejected',()=>{const r=clone(report());r.findings[0].severity='extreme';assert.throws(()=>validateReport(r),e=>e.code==='REPORT_SCHEMA_INVALID');});
test('unknown core property is rejected',()=>{const r=clone(report());r.surprise=true;assert.throws(()=>validateReport(r),e=>e.code==='REPORT_SCHEMA_INVALID');});
test('namespaced extension is accepted',()=>assert.equal(validateReport(report({extensions:{'org.veilforge.experimental':{enabled:true}}})),true));
test('unsupported report version has a dedicated error',()=>{const r=clone(report());r.reportVersion='5.0.0';assert.throws(()=>validateReport(r),e=>e.code==='REPORT_VERSION_UNSUPPORTED');});
