import assert from 'node:assert/strict';
import test from 'node:test';
import { byteOffsetToLineColumn, parseAstSourceRange, resolveSourceLocation } from '../../../packages/analyzer/src/v4/frontend/index.js';

test('AST src ranges resolve UTF-8 byte offsets without using JS character indexes', () => {
  const content = '\uFEFF// \u015f\r\ncontract \u00d6deme {}\r\n';
  const canonical = '// \u015f\ncontract \u00d6deme {}\n';
  const byteStart = Buffer.byteLength('// \u015f\ncontract ', 'utf8');
  const byteLength = Buffer.byteLength('\u00d6deme', 'utf8');
  const location = resolveSourceLocation(`${byteStart}:${byteLength}:7`, new Map([[7, { path: 'src/U.sol', content }]]));
  assert.deepEqual(location, {
    sourcePath: 'src/U.sol', sourceId: 7, startByte: byteStart, endByte: byteStart + byteLength, byteStart, byteLength, byteEnd: byteStart + byteLength,
    lineStart: 2, columnStart: 10, lineEnd: 2, columnEnd: 15, startLine: 2, startColumn: 10, endLine: 2, endColumn: 15,
  });
  assert.equal(Buffer.byteLength(canonical, 'utf8') > canonical.length, true);
});

test('line and column conversion handles LF, CRLF, BOM, and end-exclusive ranges', () => {
  assert.deepEqual(byteOffsetToLineColumn('\uFEFFa\r\nb', 2), { line: 2, column: 1 });
  assert.deepEqual(parseAstSourceRange('10:4:2'), { byteStart: 10, byteLength: 4, sourceId: 2 });
  assert.equal(parseAstSourceRange('-1:4:2'), null);
});
