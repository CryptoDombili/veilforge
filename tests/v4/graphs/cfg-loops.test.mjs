import assert from 'node:assert/strict';
import test from 'node:test';
import { cfgNamed, compileGraphs, header } from './helpers.mjs';

test('for loop separates initializer, condition, body, iteration, and exit', () => {
  const source = `${header}contract Loops { function run(uint n) external pure returns(uint s){ for(uint i=0;i<n;i++){ if(i==2)continue; if(i==4)break; s+=i; } } }`;
  const { graphs } = compileGraphs({ 'src/Loops.sol': source });
  const cfg = cfgNamed(graphs, '.run(uint256)');
  for (const kind of ['loop-initializer', 'loop-condition', 'loop-body-entry', 'loop-iteration', 'loop-exit']) assert.equal(cfg.blocks.some((block) => block.kind === kind), true, kind);
  assert.equal(cfg.edges.some((edge) => edge.edgeKind === 'break'), true);
  assert.equal(cfg.edges.some((edge) => edge.edgeKind === 'continue'), true);
  assert.equal(cfg.edges.some((edge) => edge.edgeKind === 'loop-back'), true);
});

test('while and do-while loops produce finite cyclic CFGs', () => {
  const source = `${header}contract Loops { function loops(uint n) external pure returns(uint){ uint i; while(i<n){i++;} do {i--;} while(i>0); return i; } }`;
  const { graphs } = compileGraphs({ 'src/Loops.sol': source });
  const cfg = cfgNamed(graphs, '.loops(uint256)');
  assert.equal(cfg.blocks.filter((block) => block.kind === 'loop-condition').length, 2);
  assert.equal(cfg.edges.filter((edge) => edge.edgeKind === 'loop-back').length, 2);
  assert.equal(cfg.blocks.length < 40, true);
});

test('infinite loop construction terminates and keeps explicit break exit', () => {
  const source = `${header}contract Loops { function forever() external pure { for(;;){ break; } } }`;
  const { graphs } = compileGraphs({ 'src/Loops.sol': source });
  const cfg = cfgNamed(graphs, '.forever()');
  assert.equal(cfg.edges.some((edge) => edge.edgeKind === 'break'), true);
  assert.equal(cfg.blocks.length < 20, true);
});
