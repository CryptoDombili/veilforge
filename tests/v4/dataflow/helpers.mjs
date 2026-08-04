import { compileProject } from '../../../packages/analyzer/src/v4/frontend/index.js';
import { buildProgramGraphs, lowerCompilationToIR } from '../../../packages/analyzer/src/v4/ir/index.js';
import { analyzeProgramDataflow } from '../../../packages/analyzer/src/v4/analysis/index.js';

export const header = '// SPDX-License-Identifier: MIT\npragma solidity 0.8.24;\n';

export function compileDataflow(sources, options = {}) {
  const compilation = compileProject({ sources });
  if (compilation.result.status !== 'compiled') throw new Error(compilation.result.diagnostics.map((item) => item.formattedMessage).join('\n'));
  const ir = lowerCompilationToIR(compilation);
  const graphs = buildProgramGraphs(ir);
  const dataflow = analyzeProgramDataflow(ir, graphs, options);
  return { compilation, ir, graphs, dataflow };
}

export function callableNamed(dataflow, suffix) {
  const result = dataflow.callables.find((item) => item.callableCanonicalName.endsWith(suffix));
  if (!result) throw new Error(`Callable analysis not found: ${suffix}`);
  return result;
}

export function symbolNamed(ir, name, kind = null) {
  const symbol = ir.symbols.find((item) => item.name === name && (!kind || item.kind === kind));
  if (!symbol) throw new Error(`Symbol not found: ${name}`);
  return symbol;
}

export function hasPath(analysis, fromPredicate, toPredicate) {
  const starts = analysis.valueNodes.filter(fromPredicate).map((item) => item.valueNodeId);
  const targets = new Set(analysis.valueNodes.filter(toPredicate).map((item) => item.valueNodeId));
  const adjacency = new Map();
  for (const edge of analysis.valueFlowEdges) adjacency.set(edge.fromValueNodeId, [...(adjacency.get(edge.fromValueNodeId) ?? []), edge.toValueNodeId]);
  const worklist = [...starts];
  const visited = new Set();
  while (worklist.length) {
    const current = worklist.shift();
    if (targets.has(current)) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    worklist.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

export function nodesForSymbol(analysis, symbol) {
  return analysis.valueNodes.filter((item) => item.symbolId === symbol.symbolId);
}
