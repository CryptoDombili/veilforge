import assert from 'node:assert/strict';
import test from 'node:test';
import { cfgNamed, compileGraphs, header } from './helpers.mjs';

test('if and if/else create true, false, and merge edges', () => {
  const source = `${header}contract Branches { uint x; function choose(uint v) external { if (v > 2) x=1; if (v > 3) x=2; else x=3; } }`;
  const { graphs } = compileGraphs({ 'src/Branches.sol': source });
  const cfg = cfgNamed(graphs, '.choose(uint256)');
  assert.equal(cfg.blocks.filter((block) => block.kind === 'branch').length, 2);
  assert.equal(cfg.edges.filter((edge) => edge.edgeKind === 'true').length, 2);
  assert.equal(cfg.edges.filter((edge) => edge.edgeKind === 'false').length, 2);
  assert.equal(cfg.blocks.filter((block) => block.kind === 'branch-merge').length, 2);
});

test('nested branches retain separate condition blocks', () => {
  const source = `${header}contract Branches { function nested(uint a,uint b) external pure returns(uint){ if(a>0){ if(b>0)return 1; else return 2; } return 3; } }`;
  const { graphs } = compileGraphs({ 'src/Branches.sol': source });
  const cfg = cfgNamed(graphs, '.nested(uint256,uint256)');
  assert.equal(cfg.blocks.filter((block) => block.kind === 'branch').length, 2);
  assert.equal(cfg.blocks.filter((block) => block.kind === 'return').length, 3);
  assert.equal(cfg.edges.filter((edge) => edge.edgeKind === 'return' && edge.toBlockId === cfg.normalExitBlockId).length, 3);
});
