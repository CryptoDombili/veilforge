import assert from 'node:assert/strict';
import test from 'node:test';
import { DataflowFact, ValueFlowEdge, ValueNode } from '../../../packages/analyzer/src/v4/analysis/index.js';
import { callableNamed, compileDataflow, hasPath, header, symbolNamed } from './helpers.mjs';

test('fact, value node, and edge models expose stable required fields', () => {
  const node = new ValueNode({ valueNodeId: 'v', callableId: 'c', valueKind: 'parameter' });
  const edge = new ValueFlowEdge({ edgeId: 'e', callableId: 'c', fromValueNodeId: 'a', toValueNodeId: 'b', flowKind: 'assignment' });
  const fact = new DataflowFact({ factId: 'f', callableId: 'c', bindingKey: 'symbol:s', originIds: ['v'] });
  assert.equal(node.valueKind, 'parameter');
  assert.equal(edge.flowKind, 'assignment');
  assert.deepEqual(fact.originIds, ['v']);
});

test('parameter flows to initialized local and literal initializes local', () => {
  const { ir, dataflow } = compileDataflow({ 'src/F.sol': `${header} contract F { function f(uint p) external pure { uint a = p; uint b = 7; } }` });
  const analysis = callableNamed(dataflow, '.f(uint256)');
  const p = symbolNamed(ir, 'p', 'parameter');
  const a = symbolNamed(ir, 'a', 'local-variable');
  const b = symbolNamed(ir, 'b', 'local-variable');
  assert.equal(hasPath(analysis, (n) => n.symbolId === p.symbolId && n.valueKind === 'parameter', (n) => n.symbolId === a.symbolId), true);
  assert.equal(hasPath(analysis, (n) => n.valueKind === 'literal', (n) => n.symbolId === b.symbolId), true);
});
