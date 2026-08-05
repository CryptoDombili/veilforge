import assert from 'node:assert/strict';
import test from 'node:test';
import { createScopeId, createSymbolId, declarationId, deterministicId } from '../../../packages/analyzer/src/v4/ir/index.js';

const location = { sourcePath: 'src/A.sol', byteStart: 10, byteEnd: 20 };

test('IR IDs depend on semantic context rather than AST traversal IDs', () => {
  const fields = { kind: 'function', sourcePath: 'src/A.sol', contractContext: 'src/A.sol:A', canonicalName: 'src/A.sol:A.f(uint256)', location };
  assert.equal(declarationId({ ...fields, astNodeId: 1 }), declarationId({ ...fields, astNodeId: 999 }));
  assert.notEqual(declarationId(fields), declarationId({ ...fields, canonicalName: 'src/A.sol:A.f(address)' }));
});

test('scope and symbol IDs are deterministic and domain-separated', () => {
  const ownerId = declarationId({ kind: 'contract', sourcePath: 'src/A.sol', contractContext: 'src/A.sol:A', canonicalName: 'src/A.sol:A', location });
  const scope = createScopeId({ scopeType: 'contract', ownerId, parentScopeId: 'program', sourcePath: 'src/A.sol', location });
  const symbol = createSymbolId({ kind: 'contract', declarationId: ownerId, scopeId: scope, name: 'A', canonicalName: 'src/A.sol:A' });
  assert.equal(scope, createScopeId({ scopeType: 'contract', ownerId, parentScopeId: 'program', sourcePath: 'src/A.sol', location }));
  assert.notEqual(scope, symbol);
  assert.notEqual(deterministicId('alpha', { value: 1 }), deterministicId('beta', { value: 1 }));
});
