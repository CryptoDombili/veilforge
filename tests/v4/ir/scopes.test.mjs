import assert from 'node:assert/strict';
import test from 'node:test';
import { compileIR, header } from './helpers.mjs';

test('lexical scopes represent nested blocks and shadowing deterministically', () => {
  const { ir } = compileIR({ 'src/Scopes.sol': `${header}contract Scopes { function f(uint input) external pure returns(uint result) { uint value=input; { uint value=2; result=value; } } }` });
  for (const scopeType of ['program', 'source-unit', 'contract', 'function', 'block']) {
    assert.equal(ir.scopes.some((scope) => scope.scopeType === scopeType), true, scopeType);
  }
  const values = ir.symbols.filter((symbol) => symbol.kind === 'local-variable' && symbol.name === 'value');
  assert.equal(values.length, 2);
  const inner = values.sort((a, b) => b.location.byteStart - a.location.byteStart)[0];
  const resolved = ir.lookupSymbols('value', inner.scopeId);
  assert.deepEqual(resolved.map((symbol) => symbol.symbolId), [inner.symbolId]);
});

test('lookup walks parameter and contract parent scopes', () => {
  const { ir } = compileIR({ 'src/Lookup.sol': `${header}contract Lookup { uint stateValue; function f(uint parameterValue) external view returns(uint) { { return stateValue + parameterValue; } } }` });
  const operation = ir.operations.find((item) => item.astNodeType === 'Return');
  const blockScope = ir.scopes.filter((scope) => scope.scopeType === 'block' && scope.ownerId === operation.callableId).sort((a, b) => b.location.byteStart - a.location.byteStart)[0];
  assert.equal(ir.lookupSymbols('parameterValue', blockScope.scopeId)[0].kind, 'parameter');
  assert.equal(ir.lookupSymbols('stateValue', blockScope.scopeId)[0].kind, 'state-variable');
});
