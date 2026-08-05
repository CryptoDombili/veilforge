import assert from 'node:assert/strict';
import test from 'node:test';
import { compileInterprocedural, header } from './helpers.mjs';

test('function pointer and low-level call types remain unpropagated boundaries', () => {
  const source = `${header} contract U { function pointer(function(uint) internal returns(uint) fn,uint p) internal returns(uint){return fn(p);} function raw(address target) external {target.call("");target.delegatecall("");target.staticcall("");} }`;
  const { analysis } = compileInterprocedural({ 'src/U.sol': source });
  const reasons = analysis.callBoundaries.map((item) => item.reason);
  for (const reason of ['dynamic-function-pointer', 'low-level-call-boundary', 'delegatecall-boundary', 'staticcall-boundary']) assert.equal(reasons.includes(reason), true, reason);
  assert.equal(analysis.callBoundaries.filter((item) => reasons.includes(item.reason)).every((item) => item.propagationStatus === 'boundary'), true);
});

test('this.foo and known contract calls propagate arguments across runtime trust boundaries', () => {
  const source = `${header} contract O { function ping(uint p) external pure returns(uint){return p;} } contract U { O other; function local(uint p) external pure returns(uint){return p;} function run(uint p) external returns(uint,uint){return(this.local(p),other.ping(p));} }`;
  const { analysis } = compileInterprocedural({ 'src/U.sol': source });
  const trust = analysis.callBoundaries.filter((item) => ['external-self', 'known-contract-external'].includes(item.callKind));
  assert.equal(trust.length, 2);
  assert.equal(trust.every((item) => item.reason === 'runtime-external-trust-boundary' && item.propagationStatus === 'argument-propagated'), true);
  assert.equal(trust.every((item) => item.argumentMappings.length === 1 && item.returnMappings.length === 0), true);
  assert.equal(analysis.interproceduralEdges.filter((item) => item.flowKind === 'argument-propagation'
    && trust.some((boundary) => boundary.callEdgeId === item.callEdgeId)).length, 2);
  assert.equal(analysis.incomplete.filter((item) => item.reason === 'unknown-external-return').length, 2);
});

test('dynamic storage alias and inline assembly callee remain localized incomplete', () => {
  const source = `${header} contract U { mapping(address=>uint) values; function asm(uint p) internal pure returns(uint x){assembly{x:=p}} function map(address a,uint p) internal {values[a]=p;} function run(address a,uint p) external returns(uint){map(a,p);return asm(p);} }`;
  const { analysis } = compileInterprocedural({ 'src/U.sol': source });
  assert.equal(analysis.incomplete.some((item) => item.reason === 'dynamic-storage-alias-not-modeled'), true);
  assert.equal(analysis.incomplete.some((item) => item.reason === 'unsupported-callee-semantics'), true);
});
