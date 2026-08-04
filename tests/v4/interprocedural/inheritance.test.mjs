import assert from 'node:assert/strict';
import test from 'node:test';
import { compileInterprocedural, header, interEdges } from './helpers.mjs';

test('inherited internal and super calls propagate without name matching', () => {
  const source = `${header} contract B { function helper(uint p) internal pure returns(uint){return p;} function f(uint p) public virtual returns(uint){return p+1;} } contract D is B { function f(uint p) public override returns(uint){return super.f(helper(p));} }`;
  const { analysis } = compileInterprocedural({ 'src/I.sol': source });
  const propagatedKinds = analysis.callBoundaries.filter((item) => item.propagationStatus === 'propagated').map((item) => item.callKind);
  assert.equal(propagatedKinds.includes('inherited-internal'), true);
  assert.equal(propagatedKinds.includes('super'), true);
  assert.ok(interEdges(analysis, 'argument-propagation').length >= 2);
  assert.ok(interEdges(analysis, 'return-propagation').length >= 2);
});
