import assert from 'node:assert/strict';
import test from 'node:test';
import { compileInterprocedural, header } from './helpers.mjs';

test('direct recursion converges without a budget incomplete on default limits', () => {
  const source = `${header} contract R { function down(uint n) internal pure returns(uint){if(n==0)return 0;return down(n-1);} function run(uint n) external pure returns(uint){return down(n);} }`;
  const { analysis } = compileInterprocedural({ 'src/R.sol': source });
  assert.ok(analysis.summary.recursiveCallables >= 1);
  assert.equal(analysis.incomplete.some((item) => item.reason === 'recursive-summary-convergence-failure'), false);
});

test('mutual recursion reaches a memoized summary fixed point', () => {
  const source = `${header} contract R { function a(uint n) internal pure returns(uint){if(n==0)return 0;return b(n-1);} function b(uint n) internal pure returns(uint){if(n==0)return 1;return a(n-1);} function run(uint n) external pure returns(uint){return a(n);} }`;
  const { analysis } = compileInterprocedural({ 'src/R.sol': source });
  assert.ok(analysis.summary.recursiveCallables >= 2);
  assert.equal(analysis.budget.complete, true);
});

test('five-function chain and repeated call origins remain bounded', () => {
  const source = `${header} contract R { function e(uint x) internal pure returns(uint){return x;} function d(uint x) internal pure returns(uint){return e(x);} function c(uint x) internal pure returns(uint){return d(x);} function b(uint x) internal pure returns(uint){return c(x);} function a(uint x) internal pure returns(uint){return b(x);} function run(uint x) external pure returns(uint){return a(x)+a(x+1);} }`;
  const { analysis } = compileInterprocedural({ 'src/R.sol': source });
  assert.ok(analysis.budget.used.maxObservedCallDepth >= 5);
  assert.equal(analysis.budget.complete, true);
  assert.ok(analysis.summary.argumentEdges >= 6);
});
