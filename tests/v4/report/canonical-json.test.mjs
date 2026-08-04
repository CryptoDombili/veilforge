import test from'node:test';import assert from'node:assert/strict';import{canonicalReportJson}from'../../../packages/analyzer/src/v4/report/index.js';
test('canonical object keys use Unicode code-point order',()=>assert.equal(canonicalReportJson({z:1,a:2}),'{"a":2,"z":1}'));
test('canonical output is UTF-8 compact LF and BOM free',()=>{const text=canonicalReportJson({value:'x\r\ny'});assert.ok(!text.startsWith('\uFEFF'));assert.ok(!text.includes('\n  '));});
test('circular input raises structured canonicalization error',()=>{const value={};value.self=value;assert.throws(()=>canonicalReportJson(value),e=>e.code==='REPORT_CANONICALIZATION_ERROR');});
test('NaN and Infinity are rejected',()=>{for(const value of[NaN,Infinity])assert.throws(()=>canonicalReportJson({value}),e=>e.code==='REPORT_CANONICALIZATION_ERROR');});
