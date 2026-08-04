import assert from 'node:assert/strict';
import test from 'node:test';
import { callableNamed, compileDataflow, header } from './helpers.mjs';

test('tuple assignment and declaration destructuring retain element provenance', () => {
  const source = `${header} contract T { function f(uint a, uint b) external pure returns (uint, uint) { uint x; uint y; (x, y) = (a, b); (uint p, uint q) = (x, y); return (p, q); } }`;
  const { dataflow } = compileDataflow({ 'src/T.sol': source });
  const analysis = callableNamed(dataflow, '.f(uint256,uint256)');
  assert.ok(analysis.valueNodes.filter((item) => item.valueKind === 'tuple-element').length >= 4);
  assert.equal(analysis.valueFlowEdges.some((item) => item.flowKind === 'tuple-element'), true);
  assert.ok(analysis.valueNodes.filter((item) => item.valueKind === 'return-parameter').length >= 2);
});
