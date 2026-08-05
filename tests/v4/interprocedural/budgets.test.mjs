import assert from 'node:assert/strict';
import test from 'node:test';
import { compileInterprocedural, header } from './helpers.mjs';

const source = `${header} contract B { function c(uint p) internal pure returns(uint){return p;} function b(uint p) internal pure returns(uint){return c(p);} function a(uint p) internal pure returns(uint){return b(p);} function run(uint p) external pure returns(uint){return a(p);} }`;

test('call depth and interprocedural edge budgets preserve partial results and report incomplete', () => {
  const depth = compileInterprocedural({ 'src/B.sol': source }, { budget: { maxCallDepth: 1 } }).analysis;
  assert.equal(depth.incomplete.some((item) => item.reason === 'call-depth-limit'), true);
  assert.equal(depth.budget.complete, false);
  const edges = compileInterprocedural({ 'src/B.sol': source }, { budget: { maxInterproceduralEdges: 1 } }).analysis;
  assert.equal(edges.incomplete.some((item) => item.reason === 'interprocedural-edge-budget-exceeded'), true);
  assert.ok(edges.interproceduralEdges.length <= 1);
});

test('fact, trace, and callable revisit limits are explicit', () => {
  const facts = compileInterprocedural({ 'src/B.sol': source }, { budget: { maxPropagatedFacts: 1, maxTraces: 1, maxCallableRevisits: 0 } }).analysis;
  const reasons = facts.incomplete.map((item) => item.reason);
  assert.equal(reasons.includes('fact-budget-exceeded'), true);
  assert.equal(reasons.includes('recursive-summary-convergence-failure'), true);
  assert.equal(reasons.includes('trace-budget-exceeded'), true);
  assert.ok(facts.traces.length <= 1);
});
