import assert from 'node:assert/strict';
import test from 'node:test';
import { callable, compileInterprocedural, hasProgramPath, header, interEdges } from './helpers.mjs';

test('caller parameter and local expression propagate to callee parameters', () => {
  const source = `${header} contract A { function sum(uint a,uint b) internal pure returns(uint){return a+b;} function run(uint p) external pure returns(uint){uint local=p+1;return sum(p,local);} }`;
  const { ir, analysis } = compileInterprocedural({ 'src/A.sol': source });
  const run = callable(ir, '.run(uint256)');
  const sum = callable(ir, '.sum(uint256,uint256)');
  const edges = interEdges(analysis, 'argument-propagation').filter((item) => item.fromCallableId === run.id && item.toCallableId === sum.id);
  assert.deepEqual(edges.map((item) => item.argumentIndex).sort(), [0, 1]);
  assert.equal(hasProgramPath(analysis, (n) => n.callableId === run.id && n.valueKind === 'parameter', (n) => n.callableId === sum.id && n.valueKind === 'parameter'), true);
});

test('named arguments map by compiler parameter names rather than source order', () => {
  const source = `${header} contract A { function sub(uint a,uint b) internal pure returns(uint){return a-b;} function run(uint x,uint y) external pure returns(uint){return sub({b:y,a:x});} }`;
  const { analysis } = compileInterprocedural({ 'src/A.sol': source });
  const boundary = analysis.callBoundaries.find((item) => item.propagationStatus === 'propagated');
  assert.deepEqual(boundary.argumentMappings.map((item) => item.parameterIndex).sort(), [0, 1]);
  assert.equal(new Set(boundary.argumentMappings.map((item) => item.edgeId)).size, 2);
});

test('overloads use exact referencedDeclaration and repeated values keep distinct parameter edges', () => {
  const source = `${header} contract A { function pick(uint a,uint b) internal pure returns(uint){return a+b;} function pick(address a,address b) internal pure returns(address){return a;} function run(uint x) external pure returns(uint){return pick(x,x);} }`;
  const { ir, analysis } = compileInterprocedural({ 'src/A.sol': source });
  const uintPick = callable(ir, '.pick(uint256,uint256)');
  const edges = interEdges(analysis, 'argument-propagation').filter((item) => item.toCallableId === uintPick.id);
  assert.equal(edges.length, 2);
  assert.deepEqual(edges.map((item) => item.argumentIndex).sort(), [0, 1]);
});
