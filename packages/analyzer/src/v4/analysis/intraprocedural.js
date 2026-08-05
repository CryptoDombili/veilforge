import { compareCodePoints } from '../frontend/standard-json.js';
import { createGraphContext } from '../ir/graph-context.js';
import { AnalysisInputError } from './errors.js';
import { AnalysisIncomplete, CallableAnalysis } from './fact.js';
import { emptyState, stateSignature } from './fact-lattice.js';
import { mergePredecessorStates, stateAcrossEdge } from './merge.js';
import { summarizeCallableAnalysis, summarizeProgramAnalysis } from './summary.js';
import { buildFlowTraces } from './trace-builder.js';
import { createTransferEngine } from './transfer.js';
import { analysisId } from './value-node.js';
import { DeterministicWorklist } from './worklist.js';

function analyzeCallable(program, cfg, context, { maxIterations = null } = {}) {
  const callable = context.callableById.get(cfg.callableId);
  if (!callable) throw new AnalysisInputError('CFG callable is absent from ProgramIR.', { callableId: cfg.callableId });
  const blocks = [...cfg.blocks].sort((a, b) => compareCodePoints(a.blockId, b.blockId));
  const blockById = new Map(blocks.map((item) => [item.blockId, item]));
  const edges = [...cfg.edges].filter((item) => item.reachable !== false).sort((a, b) => compareCodePoints(a.edgeId, b.edgeId));
  const incomingEdges = new Map();
  const outgoingEdges = new Map();
  for (const edge of edges) {
    incomingEdges.set(edge.toBlockId, [...(incomingEdges.get(edge.toBlockId) ?? []), edge]);
    outgoingEdges.set(edge.fromBlockId, [...(outgoingEdges.get(edge.fromBlockId) ?? []), edge]);
  }
  const inputStates = new Map();
  const outputStates = new Map();
  const nodes = new Map();
  const valueEdges = new Map();
  const incomplete = new Map();
  for (const item of cfg.unsupportedControlFlow ?? []) {
    const record = new AnalysisIncomplete({ callableId: callable.id, reason: 'unsupported-control-flow', astNodeId: item.astNodeId, location: item.location, details: { nodeType: item.nodeType, reason: item.reason } });
    incomplete.set(record.incompleteId, record);
  }
  const transfer = createTransferEngine({ program, callable, cfg, context, nodes, edges: valueEdges, incomplete });
  const worklist = new DeterministicWorklist([cfg.entryBlockId]);
  const iterationLimit = maxIterations ?? Math.max(128, blocks.length * 64);
  let iterations = 0;
  let converged = true;

  while (worklist.size) {
    if (iterations >= iterationLimit) {
      converged = false;
      const record = new AnalysisIncomplete({
        callableId: callable.id, reason: 'max-iteration-guard', blockId: worklist.take() ?? null,
        location: callable.location, details: { iterationLimit, fallback: 'bounded-fixed-point' },
      });
      incomplete.set(record.incompleteId, record);
      break;
    }
    iterations += 1;
    const blockId = worklist.take();
    const block = blockById.get(blockId);
    if (!block) continue;
    let input;
    if (blockId === cfg.entryBlockId) input = emptyState();
    else {
      const predecessors = (incomingEdges.get(blockId) ?? [])
        .filter((edge) => outputStates.has(edge.fromBlockId))
        .map((edge) => stateAcrossEdge(outputStates.get(edge.fromBlockId), edge, blockById));
      if (!predecessors.length) continue;
      input = mergePredecessorStates(predecessors);
    }
    const oldInputSignature = inputStates.has(blockId) ? stateSignature(inputStates.get(blockId)) : null;
    inputStates.set(blockId, input);
    const output = transfer.transferBlock(block, input);
    const oldOutputSignature = outputStates.has(blockId) ? stateSignature(outputStates.get(blockId)) : null;
    const newOutputSignature = stateSignature(output);
    outputStates.set(blockId, output);
    if (oldInputSignature === stateSignature(input) && oldOutputSignature === newOutputSignature) continue;
    for (const edge of outgoingEdges.get(blockId) ?? []) worklist.add(edge.toBlockId);
  }

  const facts = transfer.factsFromStates(outputStates);
  const valueNodes = [...nodes.values()].sort((a, b) => compareCodePoints(a.valueNodeId, b.valueNodeId));
  const valueFlowEdges = [...valueEdges.values()].sort((a, b) => compareCodePoints(a.edgeId, b.edgeId));
  const incompleteItems = [...incomplete.values()].sort((a, b) => compareCodePoints(a.incompleteId, b.incompleteId));
  const traces = buildFlowTraces({ callableId: callable.id, valueNodes, valueFlowEdges, incomplete: incompleteItems });
  const analysis = new CallableAnalysis({
    callableId: callable.id, callableCanonicalName: callable.canonicalName, cfgId: cfg.cfgId,
    status: incompleteItems.length ? 'incomplete' : 'complete', facts, valueNodes, valueFlowEdges,
    traces, incomplete: incompleteItems, iterations, converged,
  });
  analysis.summary = summarizeCallableAnalysis(analysis);
  return analysis;
}

export function analyzeProgramDataflow(program, graphs, options = {}) {
  if (!program?._compilation) throw new AnalysisInputError('Dataflow requires ProgramIR with compilation context.');
  if (!graphs?.cfgs || graphs.programId !== program.id) throw new AnalysisInputError('Dataflow requires graphs for the same ProgramIR.', { programId: program.id, graphProgramId: graphs?.programId });
  const context = createGraphContext(program);
  const callables = [...graphs.cfgs].sort((a, b) => compareCodePoints(a.cfgId, b.cfgId)).map((cfg) => analyzeCallable(program, cfg, context, options));
  const result = {
    schemaVersion: '1.0.0', engineVersion: program.engineVersion,
    analysisId: analysisId('program-dataflow', { programId: program.id, cfgIds: [...graphs.cfgs].map((item) => item.cfgId).sort(compareCodePoints) }),
    programId: program.id,
    callables,
    summary: null,
  };
  result.summary = summarizeProgramAnalysis(callables);
  return result;
}

export function analyzeCallableDataflow(program, graphs, callableId, options = {}) {
  const context = createGraphContext(program);
  const cfg = graphs?.cfgs?.find((item) => item.callableId === callableId);
  if (!cfg) throw new AnalysisInputError('No CFG exists for requested callable.', { callableId });
  return analyzeCallable(program, cfg, context, options);
}
