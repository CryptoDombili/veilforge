import assert from 'node:assert/strict';
import test from 'node:test';
import { callableNamed, compileDataflow, header } from './helpers.mjs';

const source = `${header} contract L {
  function loops(uint n) external pure returns (uint x) {
    for (uint i = 0; i < n; i++) { if (i == 2) continue; x += i; if (x > 20) break; }
    while (x < n) { x++; }
    do { x++; } while (x < 2);
  }
}`;

test('for, while, and do-while loops reach a stable fixed point', () => {
  const { dataflow } = compileDataflow({ 'src/L.sol': source });
  const analysis = callableNamed(dataflow, '.loops(uint256)');
  assert.equal(analysis.converged, true);
  assert.equal(analysis.incomplete.some((item) => item.reason === 'max-iteration-guard'), false);
  assert.ok(analysis.iterations > 1);
});

test('break and continue paths do not prevent convergence', () => {
  const { dataflow } = compileDataflow({ 'src/L.sol': source });
  const analysis = callableNamed(dataflow, '.loops(uint256)');
  assert.equal(analysis.converged, true);
  assert.equal(analysis.valueFlowEdges.some((item) => item.flowKind === 'compound-assignment'), true);
});
