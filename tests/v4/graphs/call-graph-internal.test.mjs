import assert from 'node:assert/strict';
import test from 'node:test';
import { compileGraphs, header } from './helpers.mjs';

test('internal calls and overloaded targets resolve through exact referencedDeclaration', () => {
  const source = `${header}contract C { function h(uint v) internal pure returns(uint){return v;} function h(address) internal pure returns(uint){return 2;} function run(uint v) external view returns(uint){return h(v)+h(msg.sender);} }`;
  const { graphs, ir } = compileGraphs({ 'src/C.sol': source });
  const run = ir.declarations.find((item) => item.canonicalName.endsWith('.run(uint256)'));
  const edges = graphs.callGraph.edges.filter((edge) => edge.callerCallableId === run.id);
  assert.equal(edges.length, 2);
  assert.equal(edges.every((edge) => edge.callKind === 'internal' && edge.resolutionStatus === 'resolved'), true);
  const targets = edges.map((edge) => ir.declarations.find((item) => item.id === edge.calleeCallableId).canonicalSignature).sort();
  assert.deepEqual(targets, ['h(address)', 'h(uint256)']);
});
