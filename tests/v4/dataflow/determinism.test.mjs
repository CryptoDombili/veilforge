import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeDataflowAnalysis } from '../../../packages/analyzer/src/v4/analysis/index.js';
import { compileDataflow, header } from './helpers.mjs';

const alpha = `${header} contract A { function f(uint p) external pure returns (uint) { uint x = p + 1; return x; } }`;
const beta = `${header} contract B { function g(uint p) external pure returns (uint) { return p * 2; } }`;

test('source insertion order does not affect facts, edges, traces, or canonical serialization', () => {
  const first = compileDataflow({ 'src/A.sol': alpha, 'src/B.sol': beta }).dataflow;
  const second = compileDataflow({ 'src/B.sol': beta, 'src/A.sol': alpha }).dataflow;
  assert.equal(serializeDataflowAnalysis(first), serializeDataflowAnalysis(second));
});

test('LF, CRLF, and UTF-8 BOM normalize to identical dataflow identities', () => {
  const lf = compileDataflow({ 'src/A.sol': alpha }).dataflow;
  const crlf = compileDataflow({ 'src/A.sol': alpha.replaceAll('\n', '\r\n') }).dataflow;
  const bom = compileDataflow({ 'src/A.sol': `\uFEFF${alpha}` }).dataflow;
  assert.equal(serializeDataflowAnalysis(lf), serializeDataflowAnalysis(crlf));
  assert.equal(serializeDataflowAnalysis(lf), serializeDataflowAnalysis(bom));
});

test('same input produces byte-identical fact, edge, trace IDs and summary', () => {
  const one = compileDataflow({ 'src/A.sol': alpha }).dataflow;
  const two = compileDataflow({ 'src/A.sol': alpha }).dataflow;
  assert.deepEqual(one.callables.map((item) => item.facts.map((fact) => fact.factId)), two.callables.map((item) => item.facts.map((fact) => fact.factId)));
  assert.deepEqual(one.callables.map((item) => item.valueFlowEdges.map((edge) => edge.edgeId)), two.callables.map((item) => item.valueFlowEdges.map((edge) => edge.edgeId)));
  assert.deepEqual(one.callables.map((item) => item.traces.map((trace) => trace.traceId)), two.callables.map((item) => item.traces.map((trace) => trace.traceId)));
  assert.deepEqual(one.summary, two.summary);
});
