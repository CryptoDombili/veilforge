import assert from 'node:assert/strict';
import test from 'node:test';
import { BasicBlock, ControlFlowEdge, ControlFlowGraph } from '../../../packages/analyzer/src/v4/ir/index.js';
import { cfgNamed, compileGraphs, header } from './helpers.mjs';

test('empty function has deterministic entry and distinct exits', () => {
  const { graphs } = compileGraphs({ 'src/Basic.sol': `${header}contract Basic { function empty() external {} }` });
  const cfg = cfgNamed(graphs, '.empty()');
  assert.ok(cfg instanceof ControlFlowGraph);
  assert.equal(new Set([cfg.entryBlockId, cfg.normalExitBlockId, cfg.revertExitBlockId]).size, 3);
  assert.ok(cfg.blocks.every((item) => item instanceof BasicBlock));
  assert.ok(cfg.edges.every((item) => item instanceof ControlFlowEdge));
  assert.equal(cfg.edges.some((edge) => edge.fromBlockId === cfg.entryBlockId && edge.toBlockId === cfg.normalExitBlockId), true);
});

test('sequential statements form ordered normal flow', () => {
  const source = `${header}contract Basic { uint x; function sequence(uint value) external { x = value; x = x + 1; emit Seen(x); } event Seen(uint); }`;
  const { graphs } = compileGraphs({ 'src/Basic.sol': source });
  const cfg = cfgNamed(graphs, '.sequence(uint256)');
  const statements = cfg.blocks.filter((block) => block.kind === 'statement' || block.kind === 'emit');
  assert.equal(statements.length, 3);
  assert.equal(cfg.edges.filter((edge) => edge.edgeKind === 'next').length >= 2, true);
  assert.equal(cfg.edges.some((edge) => edge.toBlockId === cfg.normalExitBlockId), true);
});

test('constructor, fallback, and receive each receive a separate CFG', () => {
  const source = `${header}contract EntryPoints { constructor() {} fallback() external payable {} receive() external payable {} }`;
  const { graphs } = compileGraphs({ 'src/EntryPoints.sol': source });
  for (const signature of ['.constructor()', '.fallback()', '.receive()']) {
    const cfg = cfgNamed(graphs, signature);
    assert.ok(cfg.entryBlockId && cfg.normalExitBlockId && cfg.revertExitBlockId, signature);
  }
});
