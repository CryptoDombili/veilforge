import assert from 'node:assert/strict';
import test from 'node:test';
import { compileStandardJson, getCompiler, UnsupportedCompilerError } from '../../../packages/analyzer/src/v4/frontend/index.js';

test('compiler provider loads and verifies exact solc 0.8.24', () => {
  const provider = getCompiler();
  assert.equal(provider.version, '0.8.24');
  assert.match(provider.longVersion, /^0\.8\.24\+commit\./);
});

test('compiler provider rejects requested and loaded version mismatches', () => {
  assert.throws(() => getCompiler({ requestedVersion: '0.8.23' }), UnsupportedCompilerError);
  const wrongCompiler = { version: () => '0.8.25+commit.fake', compile: () => '{}' };
  assert.throws(() => getCompiler({ compiler: wrongCompiler }), UnsupportedCompilerError);
});

test('compiler JSON errors are returned even when compile() itself succeeds', () => {
  const compiler = {
    version: () => '0.8.24+commit.test',
    compile: () => JSON.stringify({ errors: [{ severity: 'error', message: 'synthetic JSON diagnostic' }] }),
  };
  const result = compileStandardJson({ language: 'Solidity', sources: {}, settings: {} }, { compiler });
  assert.equal(result.output.errors[0].severity, 'error');
});
