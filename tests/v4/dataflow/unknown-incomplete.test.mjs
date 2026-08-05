import assert from 'node:assert/strict';
import test from 'node:test';
import { callableNamed, compileDataflow, header } from './helpers.mjs';

test('function call arguments stop at a boundary and call result is unknown', () => {
  const source = `${header} contract U { function g(uint x) public pure returns (uint) { return x; } function f(uint p) external pure returns (uint) { return g(p); } }`;
  const { dataflow } = compileDataflow({ 'src/U.sol': source });
  const analysis = callableNamed(dataflow, '.f(uint256)');
  assert.equal(analysis.valueNodes.some((item) => item.boundary === 'call-argument'), true);
  assert.equal(analysis.valueNodes.some((item) => item.valueKind === 'call-result' && item.unknown), true);
  assert.equal(analysis.incomplete.some((item) => item.reason === 'call-result-not-propagated-interprocedurally'), true);
});

test('inline assembly creates localized structured incomplete state', () => {
  const source = `${header} contract U { function f(uint p) external pure returns (uint x) { assembly { x := p } } }`;
  const { dataflow } = compileDataflow({ 'src/U.sol': source });
  const analysis = callableNamed(dataflow, '.f(uint256)');
  assert.equal(analysis.incomplete.some((item) => item.reason === 'inline-assembly-not-modeled'), true);
  assert.equal(analysis.valueNodes.some((item) => item.boundary === 'inline-assembly' && item.unknown), true);
});

test('unsupported new expression remains a visible incomplete boundary', () => {
  const source = `${header} contract U { function f(uint n) external pure returns (uint) { uint[] memory values = new uint[](n); return values.length; } }`;
  const { dataflow } = compileDataflow({ 'src/U.sol': source });
  const analysis = callableNamed(dataflow, '.f(uint256)');
  assert.equal(analysis.incomplete.some((item) => item.reason === 'unsupported-new-expression'), true);
});

test('unresolved function pointer remains a localized incomplete call boundary', () => {
  const source = `${header} contract U { function invoke(function(uint) internal pure returns (uint) fn, uint value) internal pure returns (uint) { return fn(value); } function plusOne(uint value) internal pure returns (uint) { return value + 1; } function f(uint value) external pure returns (uint) { return invoke(plusOne, value); } }`;
  const { dataflow } = compileDataflow({ 'src/U.sol': source });
  const analysis = callableNamed(dataflow, '.invoke(function (uint256) pure returns (uint256),uint256)');
  assert.equal(analysis.incomplete.some((item) => item.reason === 'unresolved-function-pointer'), true);
});
