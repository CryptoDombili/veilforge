import assert from 'node:assert/strict';
import test from 'node:test';
import { compileIR, header } from './helpers.mjs';

test('symbol table covers declarations, parameters, returns, locals, and overloads', () => {
  const { ir } = compileIR({ 'src/Symbols.sol': `${header}
    contract Symbols {
      uint stateValue;
      modifier guarded(){_;}
      event E(uint value);
      error X(uint code);
      struct S { uint field; }
      enum K { A, B }
      function f(uint value) external returns(uint result) { uint localValue=value; result=localValue; }
      function f(address value) external pure returns(address) { return value; }
    }` });
  for (const kind of ['contract', 'function', 'modifier', 'event', 'error', 'struct', 'enum', 'state-variable', 'parameter', 'return-parameter', 'local-variable']) {
    assert.equal(ir.symbols.some((symbol) => symbol.kind === kind), true, kind);
  }
  const overloads = ir.symbols.filter((symbol) => symbol.kind === 'function' && symbol.name === 'f');
  assert.equal(overloads.length, 2);
  assert.equal(new Set(overloads.map((symbol) => symbol.canonicalName)).size, 2);
  assert.deepEqual(overloads.map((item) => item.canonicalName).sort(), ['src/Symbols.sol:Symbols.f(address)', 'src/Symbols.sol:Symbols.f(uint256)']);
});

test('same symbol name in different scopes is retained without overwrite', () => {
  const { ir } = compileIR({ 'src/Names.sol': `${header}contract Names { uint value; function f(uint value) external pure returns(uint) { return value; } }` });
  const values = ir.symbols.filter((symbol) => symbol.name === 'value');
  assert.equal(values.length, 2);
  assert.equal(new Set(values.map((symbol) => symbol.scopeId)).size, 2);
  assert.equal(new Set(values.map((symbol) => symbol.symbolId)).size, 2);
});
