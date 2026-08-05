import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeProgramGraphs } from '../../../packages/analyzer/src/v4/ir/index.js';
import { compileGraphs, header } from './helpers.mjs';

const a = `${header}import "./B.sol"; contract A is B { function set(uint v) external { if(v>0)value=v; else value=helper(v); } }\n`;
const b = `${header}contract B { uint value; function helper(uint v) internal pure returns(uint){return v;} }\n`;

test('source insertion order and Windows/LF/CRLF/BOM variants yield identical graphs and IDs', () => {
  const variants = [];
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const sources = iteration % 2
      ? { 'src\\B.sol': `\uFEFF${b.replaceAll('\n', '\r\n')}`, '.\\src\\A.sol': a.replaceAll('\n', '\r\n') }
      : { 'src/A.sol': a, 'src/B.sol': b };
    const { graphs } = compileGraphs(sources);
    variants.push({
      serialized: serializeProgramGraphs(graphs),
      blockIds: graphs.cfgs.flatMap((cfg) => cfg.blocks.map((block) => block.blockId)),
      cfgEdgeIds: graphs.cfgs.flatMap((cfg) => cfg.edges.map((edge) => edge.edgeId)),
      callEdgeIds: graphs.callGraph.edges.map((edge) => edge.edgeId),
      summary: JSON.stringify(graphs.summary),
    });
  }
  for (const key of Object.keys(variants[0])) assert.equal(new Set(variants.map((item) => JSON.stringify(item[key]))).size, 1, key);
  assert.equal(variants[0].serialized.includes('hostname'), false);
  assert.equal(variants[0].serialized.includes('elapsed'), false);
  assert.equal(variants[0].serialized.includes('C:\\\\'), false);
});
