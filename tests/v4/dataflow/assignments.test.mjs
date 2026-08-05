import assert from 'node:assert/strict';
import test from 'node:test';
import { callableNamed, compileDataflow, hasPath, header, symbolNamed } from './helpers.mjs';

const source = `${header} contract A {
  function f(uint p, bool choose) external pure returns (uint) {
    uint a = p; uint b; uint c; b = a; c = b = a; c += 2;
    uint binary = a + c; uint unary = ~binary; uint conditional = choose ? a : c;
    return unary + conditional;
  }
}`;

test('local-to-local, chained, and compound assignments retain provenance', () => {
  const { ir, dataflow } = compileDataflow({ 'src/A.sol': source });
  const analysis = callableNamed(dataflow, '.f(uint256,bool)');
  const p = symbolNamed(ir, 'p', 'parameter');
  for (const name of ['a', 'b', 'c']) {
    const target = symbolNamed(ir, name, 'local-variable');
    assert.equal(hasPath(analysis, (n) => n.symbolId === p.symbolId && n.valueKind === 'parameter', (n) => n.symbolId === target.symbolId), true, name);
  }
  assert.equal(analysis.valueFlowEdges.some((item) => item.flowKind === 'compound-assignment'), true);
});

test('binary, unary, and conditional expressions combine their input provenance', () => {
  const { dataflow } = compileDataflow({ 'src/A.sol': source });
  const analysis = callableNamed(dataflow, '.f(uint256,bool)');
  assert.equal(analysis.valueFlowEdges.some((item) => item.flowKind === 'binary-operation'), true);
  assert.equal(analysis.valueFlowEdges.some((item) => item.flowKind === 'unary-operation'), true);
  assert.equal(analysis.valueFlowEdges.some((item) => item.flowKind === 'conditional-true'), true);
  assert.equal(analysis.valueFlowEdges.some((item) => item.flowKind === 'conditional-false'), true);
});
