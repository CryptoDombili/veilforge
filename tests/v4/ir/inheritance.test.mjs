import assert from 'node:assert/strict';
import test from 'node:test';
import { IRInvariantError, resolveInheritance } from '../../../packages/analyzer/src/v4/ir/index.js';
import { compileIR, richSource } from './helpers.mjs';

test('single and multiple inheritance preserve compiler linearization and inherited declarations', () => {
  const { ir } = compileIR({ 'src/Rich.sol': richSource });
  const base = ir.contracts.find((item) => item.name === 'Base');
  const mix = ir.contracts.find((item) => item.name === 'Mix');
  const single = ir.contracts.find((item) => item.name === 'Single');
  const derived = ir.contracts.find((item) => item.name === 'Derived');
  assert.deepEqual(single.directBaseContractIds, [base.id]);
  assert.deepEqual(single.linearizedBaseContractIds, [single.id, base.id]);
  assert.deepEqual(derived.directBaseContractIds, [base.id, mix.id]);
  assert.deepEqual(derived.linearizedBaseContractIds, [derived.id, mix.id, base.id]);
  for (const kind of ['state-variable', 'function', 'modifier', 'event', 'error', 'struct', 'enum']) {
    assert.equal(derived.inheritedDeclarationIds[kind].length > 0, true, kind);
  }
  const override = ir.declarations.find((item) => item.kind === 'function' && item.canonicalName === 'src/Rich.sol:Derived.set(uint256)');
  assert.equal(override.override, true);
  assert.equal(override.overrideDeclarationIds.length, 1);
  assert.equal(derived.overrideDeclarationIds.length, 1);
  assert.deepEqual(override.modifierInvocations, ['onlyPositive', 'mixed']);
});

test('scope lookup uses inheritance context for inherited symbols', () => {
  const { ir } = compileIR({ 'src/Rich.sol': richSource });
  const derived = ir.contracts.find((item) => item.name === 'Derived');
  assert.equal(ir.lookupSymbols('inheritedCount', derived.scopeId)[0].contractContext, 'src/Rich.sol:Base');
  assert.equal(ir.lookupSymbols('onlyPositive', derived.scopeId)[0].kind, 'modifier');
});

test('inheritance cycles and malformed linearization fail explicitly', () => {
  const contracts = [
    { id: 'A', astNodeId: 1, canonicalName: 'A.sol:A', scopeId: 'scope-A' },
    { id: 'B', astNodeId: 2, canonicalName: 'B.sol:B', scopeId: 'scope-B' },
  ];
  const cyclic = new Map([
    [1, { linearizedBaseContracts: [1, 2], baseContracts: [{ baseName: { referencedDeclaration: 2 } }] }],
    [2, { linearizedBaseContracts: [2, 1], baseContracts: [{ baseName: { referencedDeclaration: 1 } }] }],
  ]);
  assert.throws(() => resolveInheritance({ contracts, contractAstById: cyclic, declarations: [], scopeGraph: { setInheritedScopes() {} } }), IRInvariantError);
  const malformed = new Map([[1, { linearizedBaseContracts: [2], baseContracts: [] }], [2, { linearizedBaseContracts: [2], baseContracts: [] }]]);
  assert.throws(() => resolveInheritance({ contracts, contractAstById: malformed, declarations: [], scopeGraph: { setInheritedScopes() {} } }), IRInvariantError);
});
