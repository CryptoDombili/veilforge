import assert from 'node:assert/strict';
import test from 'node:test';
import { callableNamed, compileDataflow, header } from './helpers.mjs';

const source = `${header} contract M {
  uint value;
  modifier around() { value = 1; _; value += 2; }
  modifier second() { value += 3; _; }
  modifier twice() { _; value += 4; _; }
  function one() external around { value += 5; }
  function many() external around second { value += 6; }
  function repeated() external twice { value += 7; }
}`;

test('modifier pre, body, and post writes form one intraprocedural flow', () => {
  const { dataflow } = compileDataflow({ 'src/M.sol': source });
  const analysis = callableNamed(dataflow, '.one()');
  assert.ok(analysis.valueFlowEdges.filter((item) => item.flowKind.includes('state-write')).length >= 2);
});

test('multiple modifiers are represented in the expanded CFG analysis', () => {
  const { dataflow } = compileDataflow({ 'src/M.sol': source });
  const analysis = callableNamed(dataflow, '.many()');
  assert.ok(analysis.valueNodes.filter((item) => item.valueKind === 'state-variable').length >= 4);
});

test('multiple placeholder modifier preserves repeated body occurrences', () => {
  const { dataflow } = compileDataflow({ 'src/M.sol': source });
  const analysis = callableNamed(dataflow, '.repeated()');
  const bodyWrites = analysis.valueNodes.filter((item) => item.valueKind === 'state-variable' && item.provenance?.includes('state-write'));
  assert.ok(new Set(bodyWrites.map((item) => item.blockId)).size >= 3);
  assert.equal(analysis.incomplete.some((item) => item.details?.nodeType === 'ModifierMultiplePlaceholder'), true);
});
