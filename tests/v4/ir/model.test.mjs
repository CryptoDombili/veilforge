import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ContractIR, EnumIR, ErrorIR, EventIR, FunctionIR, LocalVariableIR, ModifierIR, ParameterIR, ProgramIR,
  ReturnParameterIR, SourceUnitIR, StateVariableIR, StorageAccess, StructIR, Symbol, Scope,
} from '../../../packages/analyzer/src/v4/ir/index.js';
import { compileIR, header } from './helpers.mjs';

test('ProgramIR models one contract and every required base object shape', () => {
  const { ir } = compileIR({ 'src/One.sol': `${header}contract One { uint public value; function get(uint p) external view returns (uint r) { uint local = p; return value + local; } }` });
  assert.ok(ir instanceof ProgramIR);
  assert.ok(ir.sources[0] instanceof SourceUnitIR);
  assert.ok(ir.contracts[0] instanceof ContractIR);
  assert.ok(ir.declarations.some((item) => item instanceof FunctionIR));
  assert.ok(ir.declarations.some((item) => item instanceof StateVariableIR));
  assert.ok(ir.declarations.some((item) => item instanceof ParameterIR));
  assert.ok(ir.declarations.some((item) => item instanceof ReturnParameterIR));
  assert.ok(ir.declarations.some((item) => item instanceof LocalVariableIR));
  assert.ok(ir.symbols[0] instanceof Symbol);
  assert.ok(ir.scopes[0] instanceof Scope);
  assert.ok(ir.storageAccesses[0] instanceof StorageAccess);
  for (const item of [ir, ...ir.sources, ...ir.contracts, ...ir.declarations, ...ir.symbols, ...ir.scopes, ...ir.storageAccesses]) {
    assert.equal(typeof item.id, 'string');
    assert.ok('nodeType' in item && 'kind' in item && 'location' in item && 'sourcePath' in item);
    assert.ok('astNodeId' in item && 'parentId' in item && 'contractContext' in item && 'canonicalName' in item);
  }
});

test('multiple contracts across two source files lower independently', () => {
  const { ir } = compileIR({
    'src/A.sol': `${header}contract A { event E(); error X(); struct S { uint v; } enum K { A, B } modifier m(){_;} }`,
    'src/B.sol': `${header}contract B { uint value; }`,
  });
  assert.equal(ir.sources.length, 2);
  assert.deepEqual(ir.contracts.map((item) => item.canonicalName), ['src/A.sol:A', 'src/B.sol:B']);
  for (const Type of [ModifierIR, EventIR, ErrorIR, StructIR, EnumIR]) assert.ok(ir.declarations.some((item) => item instanceof Type), Type.name);
});
