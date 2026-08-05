import test from'node:test';import assert from'node:assert/strict';import{report}from'./helpers.mjs';
test('compiler section records exact version settings and IDs without bytecode',()=>{const c=report().compiler;assert.equal(c.version,'0.8.24');assert.equal(c.optimizer.enabled,false);assert.deepEqual(c.contractArtifactIds,['src/Case.sol:Case']);assert.ok(!('bytecode'in c));});
test('compiler digest is stable',()=>assert.equal(report().compiler.compilerDigest,report().compiler.compilerDigest));
