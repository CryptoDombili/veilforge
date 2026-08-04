import assert from 'node:assert/strict';
import test from 'node:test';
import { compileProject, INDEXED_NODE_TYPES } from '../../../packages/analyzer/src/v4/frontend/index.js';

const source = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract Base {}
contract Rich is Base {
  struct Item { uint value; }
  enum State { Open, Closed }
  error Denied(address caller);
  event Changed(uint indexed value);
  mapping(address => Item[]) public items;
  modifier allowed() { _; }
  function set(uint value) external allowed { emit Changed(value); }
  function set(address value) external { if (value == address(0)) revert Denied(value); }
}`;

test('AST index supports IDs, types, paths, contracts, signatures, parents, and ranges', () => {
  const compilation = compileProject({ sources: { 'src/Rich.sol': source } });
  assert.equal(compilation.result.status, 'compiled');
  const index = compilation.astIndex;
  for (const nodeType of ['SourceUnit', 'ContractDefinition', 'FunctionDefinition', 'ModifierDefinition', 'EventDefinition', 'ErrorDefinition', 'StructDefinition', 'EnumDefinition', 'VariableDeclaration', 'InheritanceSpecifier']) {
    assert.equal(INDEXED_NODE_TYPES.has(nodeType), true);
    assert.equal(index.getByType(nodeType).length > 0, true, nodeType);
  }
  assert.deepEqual(index.getByFunctionSignature('set(uint256)').map((item) => item.functionSignature), ['set(uint256)']);
  assert.deepEqual(index.getByFunctionSignature('set(address)').map((item) => item.functionSignature), ['set(address)']);
  const contract = index.getByContract('src/Rich.sol:Rich');
  assert.equal(contract.length > 5, true);
  const event = index.getByType('EventDefinition')[0];
  assert.equal(index.getById(event.nodeId), event);
  assert.equal(Number.isInteger(event.parentId), true);
  assert.equal(index.getParent(event.nodeId).nodeType, 'ContractDefinition');
  assert.equal(index.getChildren(event.nodeId).some((item) => item.nodeType === 'VariableDeclaration'), true);
  assert.equal(index.getBySourcePath('src/Rich.sol').length, index.records.length);
  assert.equal(index.getBySourceRange('src/Rich.sol', 0, Buffer.byteLength(source, 'utf8')).length, index.records.length);
});

test('import directives are indexed in multi-source output', () => {
  const compilation = compileProject({ sources: {
    'src/A.sol': 'pragma solidity 0.8.24; import "./B.sol"; contract A is B {}',
    'src/B.sol': 'pragma solidity 0.8.24; contract B {}',
  } });
  assert.equal(compilation.astIndex.getByType('ImportDirective').length, 1);
  assert.equal(compilation.astIndex.getByType('ImportDirective')[0].sourcePath, 'src/A.sol');
});
