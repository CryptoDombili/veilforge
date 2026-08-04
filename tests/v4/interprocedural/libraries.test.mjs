import assert from 'node:assert/strict';
import test from 'node:test';
import { compileInterprocedural, header } from './helpers.mjs';

test('static library call propagates explicit arguments', () => {
  const source = `${header} library L { function twice(uint p) internal pure returns(uint){return p*2;} } contract C { function run(uint p) external pure returns(uint){return L.twice(p);} }`;
  const { analysis } = compileInterprocedural({ 'src/L.sol': source });
  const boundary = analysis.callBoundaries.find((item) => item.callKind === 'library');
  assert.equal(boundary.propagationStatus, 'propagated');
  assert.deepEqual(boundary.argumentMappings.map((item) => item.parameterIndex), [0]);
});

test('using-for receiver becomes implicit first library argument', () => {
  const source = `${header} library L { function plus(uint self,uint p) internal pure returns(uint){return self+p;} } contract C { using L for uint; function run(uint p) external pure returns(uint){return p.plus(2);} }`;
  const { analysis } = compileInterprocedural({ 'src/L.sol': source });
  const boundary = analysis.callBoundaries.find((item) => item.callKind === 'library');
  assert.deepEqual(boundary.argumentMappings.map((item) => item.argumentPosition), ['receiver', 0]);
  assert.deepEqual(boundary.argumentMappings.map((item) => item.parameterIndex), [0, 1]);
});
