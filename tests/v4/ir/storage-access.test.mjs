import assert from 'node:assert/strict';
import test from 'node:test';
import { compileIR, richSource } from './helpers.mjs';

test('state declarations and public getter metadata are recorded', () => {
  const { ir } = compileIR({ 'src/Rich.sol': richSource });
  const declarations = ir.storageAccesses.filter((item) => item.accessKind === 'declaration');
  assert.equal(declarations.length, 5);
  const publicNames = declarations.filter((item) => item.publicGetter).map((item) => item.pathSegments[0].name).sort();
  assert.deepEqual(publicNames, ['inheritedCount', 'records']);
});

test('mapping, array, and struct member reads and writes are distinct', () => {
  const { ir } = compileIR({ 'src/Rich.sol': richSource });
  assert.equal(ir.storageAccesses.some((item) => item.accessKind === 'write' && item.accessForm === 'mapping'), true);
  assert.equal(ir.storageAccesses.some((item) => item.accessKind === 'read' && item.accessForm === 'mapping'), true);
  const structWrites = ir.storageAccesses.filter((item) => item.accessKind === 'write' && item.accessForm === 'struct-member');
  assert.equal(structWrites.length, 1);
  assert.deepEqual(structWrites[0].pathSegments.map((item) => item.kind), ['state-variable', 'mapping-index', 'struct-member']);
  assert.equal(ir.storageAccesses.some((item) => item.accessKind === 'write' && item.accessForm === 'array'), true);
  assert.equal(ir.storageAccesses.some((item) => item.accessKind === 'read' && item.accessForm === 'array'), true);
  assert.equal(ir.storageAccesses.some((item) => item.accessKind === 'read' && item.accessForm === 'struct-member'), true);
});

test('locals and parameters are excluded while inherited state access is derived', () => {
  const { ir } = compileIR({ 'src/Rich.sol': richSource });
  const storageSymbolIds = new Set(ir.storageAccesses.map((item) => item.symbolId));
  for (const symbol of ir.symbols.filter((item) => ['local-variable', 'parameter', 'return-parameter'].includes(item.kind))) {
    assert.equal(storageSymbolIds.has(symbol.symbolId), false, symbol.canonicalName);
  }
  const inherited = ir.storageAccesses.filter((item) => item.derived && item.pathSegments[0].name === 'inheritedCount');
  assert.equal(inherited.some((item) => item.accessKind === 'write'), true);
  assert.equal(inherited.some((item) => item.accessKind === 'read'), true);
  assert.equal(inherited.every((item) => item.direct === false), true);
});
