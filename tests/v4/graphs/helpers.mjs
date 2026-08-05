import { compileProject } from '../../../packages/analyzer/src/v4/frontend/index.js';
import { buildProgramGraphs, lowerCompilationToIR } from '../../../packages/analyzer/src/v4/ir/index.js';

export const header = '// SPDX-License-Identifier: MIT\npragma solidity 0.8.24;\n';

export function compileGraphs(sources) {
  const compilation = compileProject({ sources });
  if (compilation.result.status !== 'compiled') throw new Error(compilation.result.diagnostics.map((item) => item.formattedMessage).join('\n'));
  const ir = lowerCompilationToIR(compilation);
  return { compilation, ir, graphs: buildProgramGraphs(ir) };
}

export function cfgNamed(graphs, suffix) {
  const cfg = graphs.cfgs.find((item) => item.callableCanonicalName.endsWith(suffix));
  if (!cfg) throw new Error(`CFG not found: ${suffix}`);
  return cfg;
}

export function hasPath(cfg, fromBlockId, toBlockId) {
  const worklist = [fromBlockId];
  const visited = new Set();
  while (worklist.length) {
    const current = worklist.shift();
    if (current === toBlockId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of cfg.edges.filter((item) => item.fromBlockId === current)) worklist.push(edge.toBlockId);
  }
  return false;
}

export function sourceText(block, content) {
  if (!block.location) return '';
  return Buffer.from(content, 'utf8').subarray(block.location.byteStart, block.location.byteEnd).toString('utf8');
}
