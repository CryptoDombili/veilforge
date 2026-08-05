import assert from 'node:assert/strict';
import test from 'node:test';
import { callableNamed, compileDataflow, header } from './helpers.mjs';

test('flow traces connect parameter origin to return and retain ordered IDs and locations', () => {
  const source = `${header} contract X { function f(uint p) external pure returns (uint) { uint a = p; uint b = a + 1; return b; } }`;
  const { dataflow } = compileDataflow({ 'src/X.sol': source });
  const analysis = callableNamed(dataflow, '.f(uint256)');
  const trace = analysis.traces.find((item) => {
    const start = analysis.valueNodes.find((node) => node.valueNodeId === item.startValueNodeId);
    const end = analysis.valueNodes.find((node) => node.valueNodeId === item.endValueNodeId);
    return start?.valueKind === 'parameter' && end?.boundary === 'return';
  });
  assert.ok(trace);
  assert.ok(trace.orderedNodeIds.length >= 4);
  assert.equal(trace.orderedEdgeIds.length, trace.orderedNodeIds.length - 1);
  assert.ok(trace.sourceLocations.length >= 2);
  assert.equal(trace.status, 'complete');
});

test('unknown boundary trace is explicitly incomplete', () => {
  const source = `${header} contract X { function g() public pure returns (uint) { return 1; } function f() external pure returns (uint) { return g(); } }`;
  const { dataflow } = compileDataflow({ 'src/X.sol': source });
  const analysis = callableNamed(dataflow, '.f()');
  assert.equal(analysis.traces.some((item) => item.status === 'incomplete' && item.markers.includes('unknown')), true);
});
