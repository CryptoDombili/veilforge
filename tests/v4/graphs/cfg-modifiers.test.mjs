import assert from 'node:assert/strict';
import test from 'node:test';
import { cfgNamed, compileGraphs, hasPath, header, sourceText } from './helpers.mjs';

test('single modifier placeholder connects pre, function body, and post', () => {
  const source = `${header}contract M { uint x; modifier wrap(){ x=1; _; x=3; } function f() external wrap { x=2; } }`;
  const { graphs } = compileGraphs({ 'src/M.sol': source });
  const cfg = cfgNamed(graphs, '.f()');
  const blocks = ['x=1', 'x=2', 'x=3'].map((text) => cfg.blocks.find((block) => block.kind === 'statement' && sourceText(block, source).replaceAll(' ', '').includes(text)));
  assert.equal(blocks.every(Boolean), true);
  assert.equal(hasPath(cfg, blocks[0].blockId, blocks[1].blockId), true);
  assert.equal(hasPath(cfg, blocks[1].blockId, blocks[2].blockId), true);
  assert.equal(cfg.modifierOrder.length, 1);
});

test('multiple modifiers execute outer pre, inner pre, body, inner post, outer post', () => {
  const source = `${header}contract M { uint x; modifier outer(){x=1;_;x=5;} modifier inner(){x=2;_;x=4;} function f() external outer inner {x=3;} }`;
  const { graphs } = compileGraphs({ 'src/M.sol': source });
  const cfg = cfgNamed(graphs, '.f()');
  const blocks = [1, 2, 3, 4, 5].map((value) => cfg.blocks.find((block) => block.kind === 'statement' && sourceText(block, source).replaceAll(' ', '').includes(`x=${value}`)));
  assert.equal(blocks.every(Boolean), true);
  for (let index = 0; index < blocks.length - 1; index += 1) assert.equal(hasPath(cfg, blocks[index].blockId, blocks[index + 1].blockId), true, `${index}->${index + 1}`);
  assert.equal(cfg.modifierOrder.length, 2);
});

test('multiple modifier placeholders are expanded and explicitly reported', () => {
  const source = `${header}contract M { uint x; modifier twice(){_;_;} function f() external twice {x=7;} }`;
  const { graphs } = compileGraphs({ 'src/M.sol': source });
  const cfg = cfgNamed(graphs, '.f()');
  assert.equal(cfg.unsupportedControlFlow.some((item) => item.nodeType === 'ModifierMultiplePlaceholder'), true);
  assert.equal(cfg.blocks.filter((block) => block.kind === 'statement' && sourceText(block, source).replaceAll(' ', '').includes('x=7')).length, 2);
});
