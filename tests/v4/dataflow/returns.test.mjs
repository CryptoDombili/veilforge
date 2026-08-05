import assert from 'node:assert/strict';
import test from 'node:test';
import { callableNamed, compileDataflow, hasPath, header } from './helpers.mjs';

test('named and explicit return values receive provenance', () => {
  const source = `${header} contract R { function f(uint p) external pure returns (uint result) { result = p; return result; } }`;
  const { dataflow } = compileDataflow({ 'src/R.sol': source });
  const analysis = callableNamed(dataflow, '.f(uint256)');
  assert.equal(hasPath(analysis, (n) => n.valueKind === 'parameter', (n) => n.valueKind === 'return-parameter' && n.boundary === 'return'), true);
});

test('early return flows to return boundary while revert path does not merge into normal exit', () => {
  const source = `${header} contract R { function f(uint p) external pure returns (uint) { if (p == 0) return p; if (p == 1) revert(); return p + 1; } }`;
  const { dataflow } = compileDataflow({ 'src/R.sol': source });
  const analysis = callableNamed(dataflow, '.f(uint256)');
  assert.ok(analysis.valueNodes.filter((item) => item.boundary === 'return').length >= 2);
  assert.equal(analysis.valueFlowEdges.some((item) => item.boundary === 'revert-argument' && item.flowKind === 'return'), false);
});
