import { canonicalJson, compareCodePoints } from '../frontend/standard-json.js';
import { buildCallGraph } from './call-graph.js';
import { buildControlFlowGraphs } from './cfg-builder.js';
import { createGraphContext } from './graph-context.js';

function plain(value) {
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  return value;
}

export function summarizeProgramGraphs(cfgs, callGraph) {
  const blocks = cfgs.reduce((total, cfg) => total + cfg.blocks.length, 0);
  const edges = cfgs.reduce((total, cfg) => total + cfg.edges.length, 0);
  return {
    cfgs: cfgs.length,
    blocks,
    controlFlowEdges: edges,
    unreachableBlocks: cfgs.reduce((total, cfg) => total + cfg.blocks.filter((block) => block.unreachable).length, 0),
    unsupportedControlFlow: cfgs.reduce((total, cfg) => total + cfg.unsupportedControlFlow.length, 0),
    callEdges: callGraph.edges.length,
    unresolvedCalls: callGraph.edges.filter((edge) => edge.resolutionStatus === 'unresolved').length,
    recursiveCallEdges: callGraph.edges.filter((edge) => edge.recursive).length,
  };
}

export function buildProgramGraphs(program) {
  const context = createGraphContext(program);
  const cfgs = buildControlFlowGraphs(program, context);
  const callGraph = buildCallGraph(program, context);
  return {
    schemaVersion: '1.0.0',
    engineVersion: program.engineVersion,
    programId: program.id,
    cfgs,
    callGraph,
    summary: summarizeProgramGraphs(cfgs, callGraph),
  };
}

export function normalizeProgramGraphs(graphs) {
  const normalized = plain(graphs);
  normalized.cfgs.sort((a, b) => compareCodePoints(a.cfgId, b.cfgId));
  for (const cfg of normalized.cfgs) {
    cfg.blocks.sort((a, b) => compareCodePoints(a.blockId, b.blockId));
    cfg.edges.sort((a, b) => compareCodePoints(a.edgeId, b.edgeId));
    cfg.unsupportedControlFlow.sort((a, b) => (a.location?.byteStart ?? -1) - (b.location?.byteStart ?? -1));
  }
  normalized.callGraph.edges.sort((a, b) => compareCodePoints(a.edgeId, b.edgeId));
  normalized.callGraph.callableIds.sort(compareCodePoints);
  return normalized;
}

export function serializeProgramGraphs(graphs) {
  return canonicalJson(normalizeProgramGraphs(graphs));
}
