import assert from 'node:assert/strict';
import test from 'node:test';
import { cfgNamed, compileGraphs, header } from './helpers.mjs';

test('return and revert connect to distinct exits and mark following code unreachable', () => {
  const source = `${header}contract T { uint x; error No(); function r(uint v) external returns(uint){ if(v==0) revert No(); return v; x=9; } }`;
  const { graphs } = compileGraphs({ 'src/T.sol': source });
  const cfg = cfgNamed(graphs, '.r(uint256)');
  assert.equal(cfg.edges.some((edge) => edge.edgeKind === 'return' && edge.toBlockId === cfg.normalExitBlockId), true);
  assert.equal(cfg.edges.some((edge) => edge.edgeKind === 'revert' && edge.toBlockId === cfg.revertExitBlockId), true);
  assert.equal(cfg.blocks.some((block) => block.kind === 'statement' && block.unreachable), true);
});

test('require and assert have success flow plus conditional revert edges', () => {
  const source = `${header}contract T { function checks(uint v) external pure { require(v>0); assert(v<10); } }`;
  const { graphs } = compileGraphs({ 'src/T.sol': source });
  const cfg = cfgNamed(graphs, '.checks(uint256)');
  for (const kind of ['require', 'assert']) {
    const block = cfg.blocks.find((item) => item.kind === kind);
    assert.equal(block.terminator.kind, 'conditional-revert');
    assert.equal(block.successorIds.includes(cfg.revertExitBlockId), true);
    assert.equal(block.successorIds.length, 2);
  }
});

test('unchecked is explicit and try/catch is structured unsupported control flow', () => {
  const source = `${header}contract T { function ping() external {} function u(uint v) external returns(uint){ unchecked { v++; } try this.ping() {} catch { v=0; } return v; } }`;
  const { graphs } = compileGraphs({ 'src/T.sol': source });
  const cfg = cfgNamed(graphs, '.u(uint256)');
  assert.equal(cfg.blocks.some((block) => block.kind === 'unchecked'), true);
  assert.equal(cfg.unsupportedControlFlow.some((item) => item.nodeType === 'TryStatement' && item.location), true);
});
