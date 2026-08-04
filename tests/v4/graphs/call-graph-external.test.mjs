import assert from 'node:assert/strict';
import test from 'node:test';
import { compileGraphs, header } from './helpers.mjs';

test('external self and known contract calls resolve without pretending they are internal', () => {
  const source = `${header}contract Other { function ping(uint v) external pure returns(uint){return v;} } contract C { Other other; function local(uint v) external pure returns(uint){return v;} function run(uint v) external { this.local(v); other.ping(v); } }`;
  const { graphs } = compileGraphs({ 'src/E.sol': source });
  const self = graphs.callGraph.edges.find((edge) => edge.callKind === 'external-self');
  const known = graphs.callGraph.edges.find((edge) => edge.callKind === 'known-contract-external');
  assert.equal(self.resolutionStatus, 'resolved');
  assert.ok(self.calleeCallableId);
  assert.equal(known.resolutionStatus, 'resolved');
  assert.ok(known.calleeCallableId);
});

test('low-level, delegatecall, and staticcall remain explicitly unresolved', () => {
  const source = `${header}contract C { function run(address target) external { target.call(""); target.delegatecall(""); target.staticcall(""); } }`;
  const { graphs } = compileGraphs({ 'src/E.sol': source });
  for (const kind of ['low-level-call', 'delegatecall', 'staticcall']) {
    const edge = graphs.callGraph.edges.find((item) => item.callKind === kind);
    assert.equal(edge.resolutionStatus, 'unresolved', kind);
    assert.equal(edge.calleeCallableId, null);
    assert.deepEqual(edge.candidateTargetIds, []);
    assert.equal(typeof edge.reason, 'string');
  }
});

test('dynamic function pointer calls have no invented target', () => {
  const source = `${header}contract C { function run(function(uint) internal returns(uint) fn,uint v) internal returns(uint){return fn(v);} }`;
  const { graphs } = compileGraphs({ 'src/E.sol': source });
  const edge = graphs.callGraph.edges.find((item) => item.callKind === 'dynamic/unresolved');
  assert.equal(edge.resolutionStatus, 'unresolved');
  assert.equal(edge.calleeCallableId, null);
  assert.equal(edge.reason.includes('does not reference'), true);
});
