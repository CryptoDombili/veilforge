import assert from 'node:assert/strict';
import test from 'node:test';
import { compileInterprocedural, header } from './helpers.mjs';

test('interprocedural trace orders caller, callee, and caller return transitions', () => {
  const source = `${header} contract T { function id(uint p) internal pure returns(uint){return p;} function run(uint p) external pure returns(uint){uint x=id(p);return x;} }`;
  const { analysis } = compileInterprocedural({ 'src/T.sol': source });
  const trace = analysis.traces.find((item) => item.edgeKinds.some((edge) => edge.flowKind === 'argument-propagation') && item.edgeKinds.some((edge) => edge.flowKind === 'return-propagation'));
  assert.ok(trace);
  assert.equal(trace.callableSequence.length, 3);
  assert.equal(trace.orderedEdgeIds.length, trace.orderedValueNodeIds.length - 1);
  assert.ok(trace.callSiteLocations.length >= 2);
  assert.equal(trace.status, 'complete');
});

test('recursive traces are cycle-safe and bounded', () => {
  const source = `${header} contract T { function f(uint p) internal pure returns(uint){if(p==0)return 0;return f(p-1);} function run(uint p) external pure returns(uint){return f(p);} }`;
  const { analysis } = compileInterprocedural({ 'src/T.sol': source });
  assert.ok(analysis.traces.length <= analysis.budget.limits.maxTraces);
  assert.equal(analysis.traces.some((item) => item.markers.includes('cycle-safe-cut')), true);
});
