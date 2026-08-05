import assert from 'node:assert/strict';
import test from 'node:test';
import { callable, compileInterprocedural, hasProgramPath, header, interEdges } from './helpers.mjs';

test('caller argument reaches callee state write and callable summary records side effect', () => {
  const source = `${header} contract S { uint value; function set(uint p) internal {value=p;} function run(uint p) external {set(p);} }`;
  const { ir, analysis } = compileInterprocedural({ 'src/S.sol': source });
  const run = callable(ir, '.run(uint256)');
  const set = callable(ir, '.set(uint256)');
  assert.equal(hasProgramPath(analysis, (n) => n.callableId === run.id && n.valueKind === 'parameter', (n) => n.callableId === set.id && String(n.provenance).startsWith('state-write')), true);
  const summary = analysis.callSummaries.find((item) => item.callableId === set.id);
  assert.ok(summary.parameterStateWrites.length);
  assert.ok(summary.sideEffectStoragePaths.length);
});

test('exact scalar state effect links write to read-return across two calls', () => {
  const source = `${header} contract S { uint value; function set(uint p) internal {value=p;} function get() internal view returns(uint){return value;} function run(uint p) external returns(uint){set(p);return get();} }`;
  const { ir, analysis } = compileInterprocedural({ 'src/S.sol': source });
  const run = callable(ir, '.run(uint256)');
  assert.ok(interEdges(analysis, 'storage-effect').length);
  assert.equal(hasProgramPath(analysis, (n) => n.callableId === run.id && n.valueKind === 'parameter', (n) => n.callableId === run.id && n.boundary === 'return'), true);
});
