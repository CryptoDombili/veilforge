import assert from 'node:assert/strict';
import test from 'node:test';
import { callable, compileInterprocedural, hasProgramPath, header, interEdges } from './helpers.mjs';

test('callee return propagates through caller local, state write, and caller return', () => {
  const source = `${header} contract R { uint stored; function id(uint p) internal pure returns(uint){return p;} function local(uint p) external pure returns(uint){uint x=id(p);return x;} function state(uint p) external {stored=id(p);} function direct(uint p) external pure returns(uint){return id(p);} }`;
  const { ir, analysis } = compileInterprocedural({ 'src/R.sol': source });
  assert.ok(interEdges(analysis, 'return-propagation').length >= 3);
  for (const suffix of ['.local(uint256)', '.state(uint256)', '.direct(uint256)']) {
    const caller = callable(ir, suffix);
    const target = suffix.includes('state') ? (n) => n.callableId === caller.id && n.valueKind === 'state-variable' && String(n.provenance).startsWith('state-write')
      : (n) => n.callableId === caller.id && n.boundary === 'return';
    assert.equal(hasProgramPath(analysis, (n) => n.callableId === caller.id && n.valueKind === 'parameter', target), true, suffix);
  }
});

test('named return and early/branch returns retain all callee origins', () => {
  const source = `${header} contract R { function choose(uint p,bool flag) internal pure returns(uint result){if(flag)return p;result=p+1;} function run(uint p,bool f) external pure returns(uint){return choose(p,f);} }`;
  const { ir, analysis } = compileInterprocedural({ 'src/R.sol': source });
  const choose = callable(ir, '.choose(uint256,bool)');
  const returns = interEdges(analysis, 'return-propagation').filter((item) => item.fromCallableId === choose.id);
  assert.ok(returns.length >= 2);
  assert.equal(new Set(returns.map((item) => item.returnIndex)).size, 1);
});
