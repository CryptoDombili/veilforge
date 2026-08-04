import { compareCodePoints } from '../frontend/standard-json.js';
import { createGraphContext } from '../ir/graph-context.js';
import { CallBoundary, InterproceduralFlowEdge } from './call-boundary.js';
import { buildAdjacency, createCallableSummary } from './call-summary.js';
import { AnalysisIncomplete } from './fact.js';
import { analyzeProgramDataflow } from './intraprocedural.js';
import { buildInterproceduralTraces } from './interprocedural-trace.js';
import { InterproceduralWorklist } from './interprocedural-worklist.js';
import { AnalysisBudget, createProgramAnalysisId, DEFAULT_ANALYSIS_BUDGET, ProgramAnalysis } from './program-analysis.js';
import { maxAcyclicCallDepth, recursiveCallableIds } from './recursion-guard.js';

const PROPAGATED_CALL_KINDS = new Set(['internal', 'inherited-internal', 'super', 'library']);
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function pathKey(node) { return JSON.stringify({ symbolId: node.symbolId, storagePath: node.storagePath }); }
function returnIndex(node) {
  const match = String(node.provenance ?? '').match(/^return:(\d+)$/u);
  return match ? Number(match[1]) : 0;
}
function resultIndex(node) {
  const match = String(node.provenance ?? '').match(/^call-result:(\d+)$/u);
  return match ? Number(match[1]) : 0;
}

function depthMap(callGraph) {
  const allowed = (callGraph.edges ?? []).filter((edge) => edge.resolutionStatus === 'resolved' && edge.calleeCallableId && PROPAGATED_CALL_KINDS.has(edge.callKind));
  const ids = new Set(allowed.flatMap((edge) => [edge.callerCallableId, edge.calleeCallableId]));
  const incoming = new Map();
  const outgoing = new Map();
  for (const edge of allowed) {
    incoming.set(edge.calleeCallableId, (incoming.get(edge.calleeCallableId) ?? 0) + 1);
    outgoing.set(edge.callerCallableId, [...(outgoing.get(edge.callerCallableId) ?? []), edge.calleeCallableId]);
  }
  const depths = new Map([...ids].map((id) => [id, Number.POSITIVE_INFINITY]));
  const roots = [...ids].filter((id) => !incoming.has(id));
  for (const id of (roots.length ? roots : [...ids]).sort(compare)) depths.set(id, 0);
  let changed = true;
  for (let iteration = 0; changed && iteration <= ids.size; iteration += 1) {
    changed = false;
    for (const from of [...outgoing.keys()].sort(compare)) for (const to of [...new Set(outgoing.get(from))].sort(compare)) {
      const candidate = (depths.get(from) ?? 0) + 1;
      if (candidate < (depths.get(to) ?? Number.POSITIVE_INFINITY)) { depths.set(to, candidate); changed = true; }
    }
  }
  return depths;
}

function parameterMappings(call, edge, callee, context) {
  const calleeAst = context.callableAstById.get(callee.astNodeId);
  const parameters = calleeAst?.parameters?.parameters ?? [];
  const mappings = [];
  const expression = (() => { let current = call.expression; while (current?.nodeType === 'FunctionCallOptions') current = current.expression; return current; })();
  const targetContract = callee.contractContext ? context.contractByName.get(callee.contractContext) : null;
  const receiver = expression?.nodeType === 'MemberAccess' ? expression.expression : null;
  const usingReceiver = edge.callKind === 'library' && targetContract?.contractKind === 'library'
    && receiver && !String(receiver.typeDescriptions?.typeString ?? '').startsWith('type(library ');
  if (usingReceiver) mappings.push({ argumentNode: receiver, argumentPosition: 'receiver', parameterIndex: 0, boundaryProvenance: 'call-argument:receiver' });
  const offset = usingReceiver ? 1 : 0;
  for (let index = 0; index < (call.arguments ?? []).length; index += 1) {
    let parameterIndex = index + offset;
    if ((call.names ?? []).length) {
      const named = call.names[index];
      const resolved = parameters.findIndex((item) => item.name === named);
      if (resolved >= 0) parameterIndex = resolved;
    }
    mappings.push({ argumentNode: call.arguments[index], argumentPosition: index, parameterIndex, boundaryProvenance: `call-argument:${index}` });
  }
  return mappings;
}

function reasonForBoundary(edge, call) {
  if (['external-self', 'known-contract-external'].includes(edge.callKind)) return 'runtime-external-trust-boundary';
  if (edge.callKind === 'delegatecall') return 'delegatecall-boundary';
  if (edge.callKind === 'low-level-call') return 'low-level-call-boundary';
  if (edge.callKind === 'staticcall') return 'staticcall-boundary';
  const expression = call?.expression;
  if (String(expression?.typeDescriptions?.typeString ?? '').startsWith('function (')) return 'dynamic-function-pointer';
  return 'unresolved-call';
}

export function analyzeProgramInterprocedural(program, graphs, intraprocedural = null, options = {}) {
  const limits = { ...DEFAULT_ANALYSIS_BUDGET, ...(options.budget ?? options) };
  const intra = intraprocedural ?? analyzeProgramDataflow(program, graphs, options.intraprocedural ?? {});
  const context = createGraphContext(program);
  const analysisByCallable = new Map(intra.callables.map((item) => [item.callableId, item]));
  const callableById = new Map(program.declarations.filter((item) => item.kind === 'function').map((item) => [item.id, item]));
  const boundaries = [];
  const interEdges = new Map();
  const incomplete = new Map();
  const exceeded = new Set();
  const depths = depthMap(graphs.callGraph);
  const resolvedCallAstIds = new Map();
  const resolvedValueNodeIds = new Set();
  let propagatedFacts = 0;

  function addIncomplete(reason, callableId, location, details = null) {
    const item = new AnalysisIncomplete({ callableId, reason, location, details });
    incomplete.set(item.incompleteId, item);
  }
  function budgetExceeded(reason, callableId, location, details) {
    exceeded.add(reason);
    addIncomplete(reason, callableId ?? null, location ?? null, details);
  }
  function addEdge(fields) {
    if (interEdges.size >= limits.maxInterproceduralEdges) {
      budgetExceeded('interprocedural-edge-budget-exceeded', fields.fromCallableId, fields.callSiteLocation, { limit: limits.maxInterproceduralEdges });
      return null;
    }
    if (propagatedFacts >= limits.maxPropagatedFacts) {
      budgetExceeded('fact-budget-exceeded', fields.fromCallableId, fields.callSiteLocation, { limit: limits.maxPropagatedFacts });
      return null;
    }
    const edge = new InterproceduralFlowEdge(fields);
    interEdges.set(edge.edgeId, edge);
    propagatedFacts += 1;
    return edge;
  }

  for (const callEdge of [...graphs.callGraph.edges].sort((a, b) => compareCodePoints(a.edgeId, b.edgeId))) {
    const call = context.astById.get(callEdge.expressionAstId);
    const callerAnalysis = analysisByCallable.get(callEdge.callerCallableId);
    const callee = callableById.get(callEdge.calleeCallableId);
    const allowed = callEdge.resolutionStatus === 'resolved' && callee && PROPAGATED_CALL_KINDS.has(callEdge.callKind);
    const depth = (depths.get(callEdge.callerCallableId) ?? 0) + 1;
    if (!allowed || depth > limits.maxCallDepth) {
      const reason = depth > limits.maxCallDepth ? 'call-depth-limit' : reasonForBoundary(callEdge, call);
      if (depth > limits.maxCallDepth) exceeded.add(reason);
      const boundary = new CallBoundary({
        callEdgeId: callEdge.edgeId, callerCallableId: callEdge.callerCallableId, calleeCallableId: callEdge.calleeCallableId,
        callKind: callEdge.callKind, resolutionStatus: callEdge.resolutionStatus, propagationStatus: 'boundary',
        reason, expressionAstId: callEdge.expressionAstId, location: callEdge.location,
        markers: [callEdge.resolutionStatus === 'unresolved' ? 'unresolved' : 'trust-boundary'],
      });
      boundaries.push(boundary);
      addIncomplete(reason, callEdge.callerCallableId, callEdge.location, { callEdgeId: callEdge.edgeId, resolverReason: callEdge.reason, depth, limit: limits.maxCallDepth });
      const results = callerAnalysis?.valueNodes.filter((item) => item.expressionAstId === callEdge.expressionAstId && item.boundary === 'call-result') ?? [];
      if (results.length) addIncomplete('unknown-external-return', callEdge.callerCallableId, callEdge.location, { callEdgeId: callEdge.edgeId, callKind: callEdge.callKind });
      continue;
    }
    const calleeAnalysis = analysisByCallable.get(callee.id);
    if (!callerAnalysis || !calleeAnalysis) {
      addIncomplete('unsupported-callee-semantics', callEdge.callerCallableId, callEdge.location, { callEdgeId: callEdge.edgeId, calleeCallableId: callee.id });
      continue;
    }
    const argumentMappings = [];
    for (const mapping of parameterMappings(call, callEdge, callee, context)) {
      const parameterDeclarationId = callee.parameterIds?.[mapping.parameterIndex];
      const parameterDeclaration = program.declarations.find((item) => item.id === parameterDeclarationId);
      const from = callerAnalysis.valueNodes.find((item) => item.expressionAstId === mapping.argumentNode?.id && item.boundary === 'call-argument' && item.provenance === mapping.boundaryProvenance);
      const to = calleeAnalysis.valueNodes.find((item) => item.valueKind === 'parameter' && item.symbolId === parameterDeclaration?.symbolId);
      if (!from || !to) {
        addIncomplete('argument-boundary-metadata-missing', callEdge.callerCallableId, callEdge.location, { callEdgeId: callEdge.edgeId, parameterIndex: mapping.parameterIndex });
        continue;
      }
      const propagated = addEdge({
        callEdgeId: callEdge.edgeId, fromCallableId: callEdge.callerCallableId, toCallableId: callee.id,
        fromValueNodeId: from.valueNodeId, toValueNodeId: to.valueNodeId, flowKind: 'argument-propagation',
        argumentIndex: mapping.parameterIndex, callSiteLocation: callEdge.location, calleeLocation: callee.location,
      });
      if (propagated) argumentMappings.push({ argumentPosition: mapping.argumentPosition, parameterIndex: mapping.parameterIndex, fromValueNodeId: from.valueNodeId, toValueNodeId: to.valueNodeId, edgeId: propagated.edgeId });
    }
    const callerResults = callerAnalysis.valueNodes.filter((item) => item.expressionAstId === callEdge.expressionAstId && item.boundary === 'call-result').sort((a, b) => resultIndex(a) - resultIndex(b) || compare(a.valueNodeId, b.valueNodeId));
    const calleeReturns = calleeAnalysis.valueNodes.filter((item) => item.boundary === 'return').sort((a, b) => returnIndex(a) - returnIndex(b) || compare(a.valueNodeId, b.valueNodeId));
    const returnMappings = [];
    for (const from of calleeReturns) {
      const index = returnIndex(from);
      const to = callerResults.find((item) => resultIndex(item) === index) ?? (callerResults.length === 1 ? callerResults[0] : null);
      if (!to) continue;
      const propagated = addEdge({
        callEdgeId: callEdge.edgeId, fromCallableId: callee.id, toCallableId: callEdge.callerCallableId,
        fromValueNodeId: from.valueNodeId, toValueNodeId: to.valueNodeId, flowKind: 'return-propagation',
        returnIndex: index, callSiteLocation: callEdge.location, calleeLocation: callee.location,
      });
      if (propagated) {
        returnMappings.push({ returnIndex: index, fromValueNodeId: from.valueNodeId, toValueNodeId: to.valueNodeId, edgeId: propagated.edgeId });
        resolvedValueNodeIds.add(to.valueNodeId);
      }
    }
    if (returnMappings.length) {
      const set = resolvedCallAstIds.get(callEdge.callerCallableId) ?? new Set();
      set.add(callEdge.expressionAstId);
      resolvedCallAstIds.set(callEdge.callerCallableId, set);
    }
    boundaries.push(new CallBoundary({
      callEdgeId: callEdge.edgeId, callerCallableId: callEdge.callerCallableId, calleeCallableId: callee.id,
      callKind: callEdge.callKind, resolutionStatus: callEdge.resolutionStatus, propagationStatus: 'propagated',
      reason: 'compiler-resolved-call', expressionAstId: callEdge.expressionAstId, location: callEdge.location,
      argumentMappings, returnMappings, markers: callEdge.recursive ? ['recursive'] : [],
    }));
    const calleeBlocking = calleeAnalysis.incomplete.filter((item) => ['inline-assembly-not-modeled', 'try-catch-not-modeled', 'unsupported-expression'].includes(item.reason));
    if (calleeBlocking.length) addIncomplete('unsupported-callee-semantics', callEdge.callerCallableId, callEdge.location, { callEdgeId: callEdge.edgeId, calleeReasons: calleeBlocking.map((item) => item.reason).sort(compare) });
  }

  const allNodes = intra.callables.flatMap((item) => item.valueNodes);
  const writes = allNodes.filter((item) => item.valueKind === 'state-variable' && String(item.provenance).startsWith('state-write'));
  const reads = allNodes.filter((item) => item.valueKind === 'state-variable' && item.provenance === 'state-read');
  for (const write of writes.sort((a, b) => compare(a.valueNodeId, b.valueNodeId))) for (const read of reads.sort((a, b) => compare(a.valueNodeId, b.valueNodeId))) {
    if (write.callableId === read.callableId || pathKey(write) !== pathKey(read)) continue;
    if ((write.storagePath ?? []).some((item) => ['mapping-index', 'array-index'].includes(item.kind))) continue;
    addEdge({
      callEdgeId: null, fromCallableId: write.callableId, toCallableId: read.callableId,
      fromValueNodeId: write.valueNodeId, toValueNodeId: read.valueNodeId, flowKind: 'storage-effect',
      storagePath: { symbolId: write.symbolId, pathSegments: write.storagePath },
      callSiteLocation: write.location, calleeLocation: read.location,
    });
  }

  for (const analysis of intra.callables) for (const item of analysis.incomplete) {
    if (item.reason === 'call-result-not-propagated-interprocedurally' && resolvedCallAstIds.get(analysis.callableId)?.has(item.astNodeId)) continue;
    incomplete.set(item.incompleteId, item);
  }

  const recursive = recursiveCallableIds(graphs.callGraph);
  const adjacency = buildAdjacency(intra.callables, [...interEdges.values()]);
  const summaryByCallable = new Map();
  const callersByCallee = new Map();
  for (const edge of graphs.callGraph.edges) if (edge.calleeCallableId && PROPAGATED_CALL_KINDS.has(edge.callKind)) callersByCallee.set(edge.calleeCallableId, [...(callersByCallee.get(edge.calleeCallableId) ?? []), edge.callerCallableId]);
  const worklist = new InterproceduralWorklist(intra.callables.map((item) => item.callableId));
  while (worklist.size) {
    const callableId = worklist.take();
    if (worklist.revisitCount(callableId) > limits.maxCallableRevisits) {
      budgetExceeded('recursive-summary-convergence-failure', callableId, callableById.get(callableId)?.location, { limit: limits.maxCallableRevisits });
      continue;
    }
    const analysis = analysisByCallable.get(callableId);
    const summary = createCallableSummary(analysis, adjacency, recursive.has(callableId), boundaries, {
      resolvedValueNodeIds, resolvedCallAstIds: resolvedCallAstIds.get(callableId) ?? new Set(),
    });
    const previous = summaryByCallable.get(callableId);
    if (previous?.summaryId === summary.summaryId) continue;
    summaryByCallable.set(callableId, summary);
    if (previous) for (const callerId of callersByCallee.get(callableId) ?? []) worklist.add(callerId);
  }

  const traces = buildInterproceduralTraces({
    callableAnalyses: intra.callables, interproceduralEdges: [...interEdges.values()], limits,
    onBudgetExceeded: (reason, details) => budgetExceeded(reason, null, null, details),
  });
  const observedDepth = maxAcyclicCallDepth(graphs.callGraph, PROPAGATED_CALL_KINDS);
  const budget = new AnalysisBudget({
    limits,
    used: { callableRevisits: worklist.totalRevisits(), propagatedFacts, interproceduralEdges: interEdges.size, traces: traces.length, maxObservedCallDepth: observedDepth },
    exceeded: [...exceeded].sort(compare), complete: exceeded.size === 0,
  });
  const callSummaries = [...summaryByCallable.values()].sort((a, b) => compare(a.summaryId, b.summaryId));
  const sortedBoundaries = boundaries.sort((a, b) => compare(a.boundaryId, b.boundaryId));
  const sortedEdges = [...interEdges.values()].sort((a, b) => compare(a.edgeId, b.edgeId));
  const incompleteItems = [...incomplete.values()].sort((a, b) => compare(a.incompleteId, b.incompleteId));
  const result = new ProgramAnalysis({
    engineVersion: program.engineVersion,
    analysisId: createProgramAnalysisId(program.id, intra.analysisId, limits), programId: program.id,
    callableAnalyses: intra.callables, callSummaries, callBoundaries: sortedBoundaries,
    interproceduralEdges: sortedEdges, traces, incomplete: incompleteItems, budget,
  });
  result.summary = {
    callables: intra.callables.length, callSummaries: callSummaries.length, callBoundaries: sortedBoundaries.length,
    propagatedCalls: sortedBoundaries.filter((item) => item.propagationStatus === 'propagated').length,
    trustBoundaries: sortedBoundaries.filter((item) => item.propagationStatus !== 'propagated').length,
    argumentEdges: sortedEdges.filter((item) => item.flowKind === 'argument-propagation').length,
    returnEdges: sortedEdges.filter((item) => item.flowKind === 'return-propagation').length,
    storageEffectEdges: sortedEdges.filter((item) => item.flowKind === 'storage-effect').length,
    recursiveCallables: recursive.size, traces: traces.length, incomplete: incompleteItems.length,
    budgetComplete: budget.complete,
  };
  return result;
}

export { PROPAGATED_CALL_KINDS };
