import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeProgramAnalysis } from '../../../packages/analyzer/src/v4/analysis/index.js';
import { compileInterprocedural, header } from './helpers.mjs';

const alpha = `${header} contract A { function id(uint p) internal pure returns(uint){return p;} function run(uint p) external pure returns(uint){return id(p);} }`;
const beta = `${header} library L { function twice(uint p) internal pure returns(uint){return p*2;} } contract B { function run(uint p) external pure returns(uint){return L.twice(p);} }`;

test('source insertion order produces identical summary, edge, and trace IDs', () => {
  const first = compileInterprocedural({ 'src/A.sol': alpha, 'src/B.sol': beta }).analysis;
  const second = compileInterprocedural({ 'src/B.sol': beta, 'src/A.sol': alpha }).analysis;
  assert.equal(serializeProgramAnalysis(first), serializeProgramAnalysis(second));
});

test('LF, CRLF, and BOM variants are byte-identical', () => {
  const lf = compileInterprocedural({ 'src/A.sol': alpha }).analysis;
  const crlf = compileInterprocedural({ 'src/A.sol': alpha.replaceAll('\n', '\r\n') }).analysis;
  const bom = compileInterprocedural({ 'src/A.sol': `\uFEFF${alpha}` }).analysis;
  assert.equal(serializeProgramAnalysis(lf), serializeProgramAnalysis(crlf));
  assert.equal(serializeProgramAnalysis(lf), serializeProgramAnalysis(bom));
});

test('same input repeats callable summary, edge, trace, incomplete, and program summary IDs', () => {
  const one = compileInterprocedural({ 'src/A.sol': alpha }).analysis;
  const two = compileInterprocedural({ 'src/A.sol': alpha }).analysis;
  assert.deepEqual(one.callSummaries.map((item) => item.summaryId), two.callSummaries.map((item) => item.summaryId));
  assert.deepEqual(one.interproceduralEdges.map((item) => item.edgeId), two.interproceduralEdges.map((item) => item.edgeId));
  assert.deepEqual(one.traces.map((item) => item.traceId), two.traces.map((item) => item.traceId));
  assert.deepEqual(one.incomplete.map((item) => item.incompleteId), two.incomplete.map((item) => item.incompleteId));
  assert.deepEqual(one.summary, two.summary);
});
