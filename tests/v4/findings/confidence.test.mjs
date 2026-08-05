import test from'node:test';import assert from'node:assert/strict';import{detectorResult,findings}from'./helpers.mjs';
test('high impact and low confidence remain independent',()=>{const f=findings(detectorResult({confidence:'low',complete:false,disposition:'incomplete',incompleteReasons:['classification-incomplete']})).findings[0];assert.equal(f.severity,'high');assert.equal(f.confidence,'low');});
test('complete resolved trace has high confidence',()=>assert.equal(findings(detectorResult()).findings[0].confidence,'high'));
test('dynamic alias lowers confidence',()=>assert.equal(findings(detectorResult({complete:false,disposition:'incomplete',incompleteReasons:['dynamic-storage-alias-not-modeled']})).findings[0].confidence,'low'));
