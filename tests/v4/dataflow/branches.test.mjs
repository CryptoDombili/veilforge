import assert from 'node:assert/strict';
import test from 'node:test';
import { callableNamed, compileDataflow, header, symbolNamed } from './helpers.mjs';

const source = `${header} contract B {
  function f(bool first, bool second) external pure returns (uint) {
    uint value;
    if (first) value = 1; else value = 2;
    if (second) { if (first) value = 3; else value = 4; }
    return value;
  }
}`;

test('true and false branch path metadata is retained', () => {
  const { dataflow } = compileDataflow({ 'src/B.sol': source });
  const analysis = callableNamed(dataflow, '.f(bool,bool)');
  const outcomes = analysis.facts.flatMap((item) => item.pathConditions.map((condition) => condition.outcome));
  assert.equal(outcomes.includes(true), true);
  assert.equal(outcomes.includes(false), true);
  assert.equal(analysis.facts.some((item) => item.pathConditions.some((condition) => condition.predecessorBlockId)), true);
});

test('branch merge and nested branch retain multiple origins', () => {
  const { ir, dataflow } = compileDataflow({ 'src/B.sol': source });
  const analysis = callableNamed(dataflow, '.f(bool,bool)');
  const value = symbolNamed(ir, 'value', 'local-variable');
  assert.equal(analysis.facts.some((item) => item.symbolId === value.symbolId && item.originIds.length >= 2), true);
  assert.equal(analysis.facts.some((item) => item.symbolId === value.symbolId && item.originIds.length >= 3), true);
});
