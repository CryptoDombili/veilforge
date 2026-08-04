import assert from 'node:assert/strict';
import test from 'node:test';
import { compileGraphs, header } from './helpers.mjs';

test('static and using-for library calls resolve to library callable IDs', () => {
  const source = `${header}library L { function twice(uint v) internal pure returns(uint){return v*2;} } contract C { using L for uint; function a(uint v) external pure returns(uint){return L.twice(v);} function b(uint v) external pure returns(uint){return v.twice();} }`;
  const { graphs, ir } = compileGraphs({ 'src/L.sol': source });
  const edges = graphs.callGraph.edges.filter((edge) => edge.callKind === 'library');
  assert.equal(edges.length, 2);
  assert.equal(edges.every((edge) => edge.resolutionStatus === 'resolved' && edge.calleeCallableId), true);
  assert.equal(new Set(edges.map((edge) => edge.calleeCallableId)).size, 1);
  assert.equal(ir.declarations.find((item) => item.id === edges[0].calleeCallableId).contractContext, 'src/L.sol:L');
});
