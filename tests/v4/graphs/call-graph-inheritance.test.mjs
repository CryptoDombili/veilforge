import assert from 'node:assert/strict';
import test from 'node:test';
import { compileGraphs, header } from './helpers.mjs';

test('inherited internal and super calls resolve to compiled base implementations', () => {
  const source = `${header}contract Base { function helper(uint v) internal pure returns(uint){return v;} function f(uint v) public virtual returns(uint){return v;} } contract D is Base { function f(uint v) public override returns(uint){return super.f(helper(v));} }`;
  const { graphs, ir } = compileGraphs({ 'src/I.sol': source });
  const derived = ir.declarations.find((item) => item.canonicalName.endsWith(':D.f(uint256)'));
  assert.equal(derived.override, true);
  const edges = graphs.callGraph.edges.filter((edge) => edge.callerCallableId === derived.id);
  const inherited = edges.find((edge) => edge.callKind === 'inherited-internal');
  const superEdge = edges.find((edge) => edge.callKind === 'super');
  assert.ok(inherited?.calleeCallableId);
  assert.ok(superEdge?.calleeCallableId);
  assert.notEqual(inherited.calleeCallableId, superEdge.calleeCallableId);
  assert.equal(superEdge.reason.includes('linearized'), true);
});
