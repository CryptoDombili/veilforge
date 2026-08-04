import assert from 'node:assert/strict';
import test from 'node:test';
import { compileGraphs, header } from './helpers.mjs';

test('direct recursion creates one marked recursive edge without traversal recursion', () => {
  const source = `${header}contract R { function fact(uint n) internal returns(uint){if(n<2)return 1;return n*fact(n-1);} }`;
  const { graphs } = compileGraphs({ 'src/R.sol': source });
  const edge = graphs.callGraph.edges.find((item) => item.callerCallableId === item.calleeCallableId);
  assert.equal(edge.recursive, true);
  assert.equal(graphs.callGraph.summary.recursiveEdges, 1);
});

test('indirect recursion marks all cycle edges and terminates', () => {
  const source = `${header}contract R { function a(uint n) internal returns(uint){return n==0?0:b(n-1);} function b(uint n) internal returns(uint){return n==0?0:a(n-1);} }`;
  const { graphs } = compileGraphs({ 'src/R.sol': source });
  assert.equal(graphs.callGraph.edges.length, 2);
  assert.equal(graphs.callGraph.edges.every((edge) => edge.recursive), true);
  assert.equal(graphs.callGraph.summary.recursiveEdges, 2);
});
