import assert from 'node:assert/strict';
import test from 'node:test';
import { callable, callableAnalysis, compileInterprocedural, header, interEdges } from './helpers.mjs';

test('multiple returns map by index into tuple destructuring', () => {
  const source = `${header} contract M { function pair(uint p) internal pure returns(uint,uint){return(p,p+1);} function run(uint p) external pure returns(uint,uint){(uint a,uint b)=pair(p);return(a,b);} }`;
  const { ir, analysis } = compileInterprocedural({ 'src/M.sol': source });
  const pair = callable(ir, '.pair(uint256)');
  const run = callable(ir, '.run(uint256)');
  const edges = interEdges(analysis, 'return-propagation').filter((item) => item.fromCallableId === pair.id && item.toCallableId === run.id);
  assert.deepEqual([...new Set(edges.map((item) => item.returnIndex))].sort(), [0, 1]);
  const callerAnalysis = callableAnalysis(analysis, run.id);
  assert.equal(callerAnalysis.valueNodes.filter((item) => item.boundary === 'call-result' && item.valueKind === 'tuple-element').length, 2);
});

test('revert-only callee does not invent a normal return edge', () => {
  const source = `${header} contract M { function fail() internal pure {revert();} function run() external pure {fail();} }`;
  const { ir, analysis } = compileInterprocedural({ 'src/M.sol': source });
  const fail = callable(ir, '.fail()');
  assert.equal(interEdges(analysis, 'return-propagation').some((item) => item.fromCallableId === fail.id), false);
});
