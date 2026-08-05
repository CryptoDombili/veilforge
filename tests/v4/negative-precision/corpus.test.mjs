import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runBenchmarkCase } from '../../../packages/benchmark/src/index.js';

const manifest=JSON.parse(fs.readFileSync(new URL('../../corpus/manifest.json',import.meta.url),'utf8'));
const negativeIds=manifest.cases.filter((item)=>item.classification==='negative').map((item)=>item.id).sort();

test('all 18 negative cases have no benchmark false positives', async()=>{
  const results=[]; for(const id of negativeIds)results.push(await runBenchmarkCase(id));
  assert.equal(results.length,18); assert.equal(results.reduce((n,item)=>n+item.falsePositives.length,0),0);
  assert.equal(results.filter((item)=>item.compileMatch).length,18);
  assert.equal(results.reduce((n,item)=>n+item.falseNegatives.length,0),0);
});
