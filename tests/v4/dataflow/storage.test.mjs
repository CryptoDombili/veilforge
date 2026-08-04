import assert from 'node:assert/strict';
import test from 'node:test';
import { callableNamed, compileDataflow, hasPath, header, symbolNamed } from './helpers.mjs';

const source = `${header} contract S {
  struct Record { uint amount; }
  uint value; mapping(address => uint) balances; uint[] values; mapping(address => Record) records;
  function write(uint p) external { uint local = p; value = local; value += 1; balances[msg.sender] = p; values.push(p); values[0] = p; records[msg.sender].amount = p; }
  function read() external view returns (uint) { uint local = value; return local + balances[msg.sender] + values[0] + records[msg.sender].amount; }
}`;

test('parameter/local provenance reaches state writes and compound state update', () => {
  const { ir, dataflow } = compileDataflow({ 'src/S.sol': source });
  const analysis = callableNamed(dataflow, '.write(uint256)');
  const p = symbolNamed(ir, 'p', 'parameter');
  assert.equal(hasPath(analysis, (n) => n.symbolId === p.symbolId && n.valueKind === 'parameter', (n) => n.valueKind === 'state-variable' && n.provenance?.startsWith('state-write')), true);
  assert.equal(analysis.valueFlowEdges.some((item) => item.flowKind === 'compound-state-write'), true);
});

test('state reads flow to local and return values', () => {
  const { dataflow } = compileDataflow({ 'src/S.sol': source });
  const analysis = callableNamed(dataflow, '.read()');
  assert.equal(hasPath(analysis, (n) => n.valueKind === 'state-variable', (n) => n.valueKind === 'local-variable'), true);
  assert.equal(hasPath(analysis, (n) => n.valueKind === 'state-variable', (n) => n.valueKind === 'return-parameter'), true);
});

test('mapping, array, and struct storage path segments are preserved', () => {
  const { dataflow } = compileDataflow({ 'src/S.sol': source });
  const all = dataflow.callables.flatMap((item) => item.valueNodes).filter((item) => item.valueKind === 'state-variable');
  assert.equal(all.some((item) => item.storagePath.some((part) => part.kind === 'mapping-index')), true);
  assert.equal(all.some((item) => item.storagePath.some((part) => part.kind === 'array-index')), true);
  assert.equal(all.some((item) => item.storagePath.some((part) => part.kind === 'struct-member')), true);
  assert.equal(dataflow.callables.some((item) => item.incomplete.some((entry) => entry.reason === 'dynamic-storage-alias-not-modeled')), true);
});
