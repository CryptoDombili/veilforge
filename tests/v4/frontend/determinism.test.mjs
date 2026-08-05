import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalSnapshotJson, compileProject } from '../../../packages/analyzer/src/v4/frontend/index.js';

const aLf = '// SPDX-License-Identifier: MIT\npragma solidity 0.8.24;\nimport "./B.sol";\ncontract A is B {}\n';
const bLf = '// SPDX-License-Identifier: MIT\npragma solidity 0.8.24;\ncontract B {}\n';

test('same logical input produces byte-identical snapshot and hashes', () => {
  const variants = [];
  for (let iteration = 0; iteration < 5; iteration += 1) {
    const sources = iteration % 2
      ? { 'src\\B.sol': `\uFEFF${bLf.replaceAll('\n', '\r\n')}`, '.\\src\\A.sol': aLf.replaceAll('\n', '\r\n') }
      : { 'src/A.sol': aLf, 'src/B.sol': bLf };
    const compilation = compileProject({ sources });
    variants.push({
      json: canonicalSnapshotJson(compilation.result),
      sourceHash: compilation.result.canonicalSourceHash,
      inputHash: compilation.result.compilerInputHash,
    });
  }
  assert.equal(new Set(variants.map((item) => item.json)).size, 1);
  assert.equal(new Set(variants.map((item) => item.sourceHash)).size, 1);
  assert.equal(new Set(variants.map((item) => item.inputHash)).size, 1);
  assert.equal(variants[0].json.includes('hostname'), false);
  assert.equal(variants[0].json.includes('generatedAt'), false);
  assert.equal(variants[0].json.includes('executionTime'), false);
});
