import { compileProject } from '../../../packages/analyzer/src/v4/frontend/index.js';
import { buildProgramGraphs, lowerCompilationToIR } from '../../../packages/analyzer/src/v4/ir/index.js';
import { analyzeProgramDataflow, analyzeProgramInterprocedural } from '../../../packages/analyzer/src/v4/analysis/index.js';

export const header = '// SPDX-License-Identifier: MIT\npragma solidity 0.8.24;\n';

export function compileInterprocedural(sources, options = {}) {
  const compilation = compileProject({ sources });
  if (compilation.result.status !== 'compiled') throw new Error(compilation.result.diagnostics.map((item) => item.formattedMessage).join('\n'));
  const ir = lowerCompilationToIR(compilation);
  const graphs = buildProgramGraphs(ir);
  const intraprocedural = analyzeProgramDataflow(ir, graphs);
  const analysis = analyzeProgramInterprocedural(ir, graphs, intraprocedural, options);
  return { compilation, ir, graphs, intraprocedural, analysis };
}

export function callable(ir, suffix) {
  const result = ir.declarations.find((item) => item.kind === 'function' && item.canonicalName.endsWith(suffix));
  if (!result) throw new Error(`Callable not found: ${suffix}`);
  return result;
}

export function callableAnalysis(analysis, callableId) {
  const result = analysis.callableAnalyses.find((item) => item.callableId === callableId);
  if (!result) throw new Error(`Callable analysis not found: ${callableId}`);
  return result;
}

export function interEdges(analysis, kind) {
  return analysis.interproceduralEdges.filter((item) => item.flowKind === kind);
}

export function hasProgramPath(analysis, fromPredicate, toPredicate) {
  const nodes = analysis.callableAnalyses.flatMap((item) => item.valueNodes);
  const starts = nodes.filter(fromPredicate).map((item) => item.valueNodeId);
  const targets = new Set(nodes.filter(toPredicate).map((item) => item.valueNodeId));
  const adjacency = new Map();
  const allEdges = [...analysis.callableAnalyses.flatMap((item) => item.valueFlowEdges), ...analysis.interproceduralEdges];
  for (const edge of allEdges) adjacency.set(edge.fromValueNodeId, [...(adjacency.get(edge.fromValueNodeId) ?? []), edge.toValueNodeId]);
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
