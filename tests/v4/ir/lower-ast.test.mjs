import assert from 'node:assert/strict';
import test from 'node:test';
import { compileIR, header, richSource } from './helpers.mjs';

test('required declaration and operation AST nodes lower into deterministic IR records', () => {
  const { ir } = compileIR({ 'src/Rich.sol': richSource });
  for (const kind of ['contract', 'function', 'modifier', 'event', 'error', 'struct', 'enum', 'state-variable', 'parameter', 'return-parameter', 'local-variable']) {
    assert.equal(ir.declarations.some((item) => item.kind === kind), true, kind);
  }
  for (const astNodeType of ['VariableDeclarationStatement', 'Assignment', 'Identifier', 'MemberAccess', 'IndexAccess', 'FunctionCall', 'Return', 'EmitStatement']) {
    assert.equal(ir.operations.some((item) => item.astNodeType === astNodeType), true, astNodeType);
  }
  assert.equal(ir.operations.every((item) => item.location && item.parentId && item.contractContext), true);
});

test('revert and custom error calls are lowered without detector semantics', () => {
  const { ir } = compileIR({ 'src/Revert.sol': `${header}contract RevertCase { error Denied(uint code); function f(uint code) external pure { if (code > 0) revert Denied(code); } }` });
  assert.equal(ir.operations.some((item) => item.astNodeType === 'RevertStatement'), true);
  assert.equal(ir.operations.some((item) => item.astNodeType === 'FunctionCall'), true);
  assert.equal(ir.declarations.some((item) => item.kind === 'error'), true);
});

test('not-yet-lowered AST nodes are retained in structured unsupportedNodes', () => {
  const { ir } = compileIR({ 'src/Unsupported.sol': `${header}contract Unsupported { function f(uint x) external pure returns(uint) { if (x > 1) return x + 1; return 0; } }` });
  for (const nodeType of ['IfStatement', 'BinaryOperation', 'Literal']) {
    const unsupported = ir.unsupportedNodes.find((item) => item.nodeType === nodeType);
    assert.ok(unsupported, nodeType);
    assert.equal(unsupported.kind, 'unsupported-node');
    assert.equal(unsupported.sourcePath, 'src/Unsupported.sol');
    assert.ok(unsupported.location);
  }
  assert.equal(ir.summary.unsupportedNodes, ir.unsupportedNodes.length);
});
