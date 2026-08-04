import assert from 'node:assert/strict';
import test from 'node:test';
import { compileProject, UnsupportedCompilerError } from '../../../packages/analyzer/src/v4/frontend/index.js';

const header = '// SPDX-License-Identifier: MIT\npragma solidity 0.8.24;\n';

test('valid multi-source project compiles relative, nested, remapped, and inherited contracts', () => {
  const compilation = compileProject({
    sources: {
      'src/Main.sol': `${header}import "./nested/Base.sol"; import "@lib/Util.sol"; contract Main is Base { using Util for uint; modifier positive(uint x) { require(x > 0); _; } function f(uint x) external positive(x) returns (uint) { return x.twice(); } }`,
      'src/nested/Base.sol': `${header}contract Base { uint public value; }`,
      'lib/Util.sol': `${header}library Util { function twice(uint x) internal pure returns (uint) { return x * 2; } }`,
    },
    settings: { remappings: ['@lib/=lib/'], optimizer: { enabled: true, runs: 200 } },
  });
  assert.equal(compilation.result.status, 'compiled');
  assert.equal(compilation.result.contracts.length, 3);
  assert.equal(compilation.importGraph.diagnostics.length, 0);
  assert.equal(compilation.astIndex.getByType('InheritanceSpecifier').length, 1);
  assert.equal(compilation.astIndex.getByType('ModifierDefinition').length, 1);
});

test('compiler diagnostics make syntax errors and unsupported pragmas analysis-incomplete', () => {
  const syntax = compileProject({ sources: { 'src/Bad.sol': `${header}contract Bad { function broken( external {} }` } });
  assert.equal(syntax.result.status, 'analysis-incomplete');
  assert.equal(syntax.result.reason, 'compiler-error');
  assert.equal(syntax.astIndex, null);
  assert.equal(syntax.result.diagnostics.some((item) => item.severity === 'error' && item.sourcePath === 'src/Bad.sol'), true);
  assert.equal(Number.isInteger(syntax.result.diagnostics[0].byteStart), true);

  const pragma = compileProject({ sources: { 'src/Future.sol': 'pragma solidity ^0.9.0; contract Future {}' } });
  assert.equal(pragma.result.status, 'analysis-incomplete');
});

test('Unicode identifier rejection preserves compiler UTF-8 byte location', () => {
  const compilation = compileProject({ sources: { 'src/Unicode.sol': `${header}contract Ödeme {}` } });
  assert.equal(compilation.result.status, 'analysis-incomplete');
  const diagnostic = compilation.result.diagnostics.find((item) => item.severity === 'error');
  assert.equal(diagnostic.sourcePath, 'src/Unicode.sol');
  assert.equal(Number.isInteger(diagnostic.byteStart), true);
  assert.equal(Number.isInteger(diagnostic.line), true);
  assert.equal(Number.isInteger(diagnostic.column), true);
});

test('missing imports are compiler errors and cycles do not hang compilation', () => {
  const missing = compileProject({ sources: { 'src/A.sol': `${header}import "./Missing.sol"; contract A {}` } });
  assert.equal(missing.result.status, 'analysis-incomplete');
  assert.equal(missing.importGraph.diagnostics[0].errorCode, 'import-not-found');

  const cycle = compileProject({ sources: {
    'src/A.sol': `${header}import "./B.sol"; contract A {}`,
    'src/B.sol': `${header}import "./A.sol"; contract B {}`,
  } });
  assert.equal(cycle.result.status, 'compiled');
  assert.equal(cycle.importGraph.cycles.length, 1);
});

test('requested compiler version mismatch is explicit', () => {
  assert.throws(() => compileProject({
    compilerVersion: '0.8.23',
    sources: { 'src/A.sol': 'pragma solidity 0.8.23; contract A {}' },
  }), UnsupportedCompilerError);
});

test('warnings remain in successful snapshots and compiler JSON errors are never success', () => {
  const warning = compileProject({ sources: { 'src/W.sol': 'pragma solidity 0.8.24; contract W {}' } });
  assert.equal(warning.result.status, 'compiled');
  assert.equal(warning.result.diagnostics.some((item) => item.severity === 'warning'), true);

  const fakeCompiler = {
    version: () => '0.8.24+commit.synthetic',
    compile: () => JSON.stringify({ errors: [{
      severity: 'error', errorCode: '9999', type: 'ParserError', component: 'general', message: 'synthetic', formattedMessage: 'synthetic',
      sourceLocation: { file: 'src/A.sol', start: 0, end: 6 },
    }] }),
  };
  const synthetic = compileProject({ compiler: fakeCompiler, sources: { 'src/A.sol': 'abcdef' } });
  assert.equal(synthetic.result.status, 'analysis-incomplete');
  assert.equal(synthetic.result.diagnostics[0].byteLength, 6);
});
