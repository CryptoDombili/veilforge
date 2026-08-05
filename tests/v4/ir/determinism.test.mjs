import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeProgramIR } from '../../../packages/analyzer/src/v4/ir/index.js';
import { compileIR, header } from './helpers.mjs';

const a = `${header}import "./B.sol"; contract A is B { function set(uint v) external { value=v; } }\n`;
const b = `${header}contract B { uint public value; }\n`;

test('source insertion order and Windows/LF/CRLF/BOM variants produce identical IR and IDs', () => {
  const variants = [];
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const sources = iteration % 2
      ? { 'src\\B.sol': `\uFEFF${b.replaceAll('\n', '\r\n')}`, '.\\src\\A.sol': a.replaceAll('\n', '\r\n') }
      : { 'src/A.sol': a, 'src/B.sol': b };
    const { ir } = compileIR(sources);
    variants.push({
      serialized: serializeProgramIR(ir),
      declarationIds: ir.declarations.map((item) => item.id),
      symbolIds: ir.symbols.map((item) => item.symbolId),
      scopeIds: ir.scopes.map((item) => item.scopeId),
      storageIds: ir.storageAccesses.map((item) => item.accessId),
      summary: JSON.stringify(ir.summary),
    });
  }
  for (const key of Object.keys(variants[0])) assert.equal(new Set(variants.map((item) => JSON.stringify(item[key]))).size, 1, key);
  assert.equal(variants[0].serialized.includes('hostname'), false);
  assert.equal(variants[0].serialized.includes('generatedAt'), false);
  assert.equal(variants[0].serialized.includes('elapsed'), false);
  assert.equal(variants[0].serialized.includes('C:\\\\'), false);
});
