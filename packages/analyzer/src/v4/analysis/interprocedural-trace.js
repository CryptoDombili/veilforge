import { analysisId, locationAnchor } from './value-node.js';

function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function compress(values) { return values.filter((item, index) => index === 0 || item !== values[index - 1]); }

export class InterproceduralTrace {
  constructor(fields = {}) {
    Object.assign(this, {
      traceId: fields.traceId,
      startCallableId: fields.startCallableId,
      startValueNodeId: fields.startValueNodeId,
      endCallableId: fields.endCallableId,
      endValueNodeId: fields.endValueNodeId,
      callableSequence: fields.callableSequence ?? [],
      orderedValueNodeIds: fields.orderedValueNodeIds ?? [],
      orderedEdgeIds: fields.orderedEdgeIds ?? [],
      edgeKinds: fields.edgeKinds ?? [],
      callSiteLocations: fields.callSiteLocations ?? [],
      calleeLocations: fields.calleeLocations ?? [],
      markers: fields.markers ?? [],
      status: fields.status ?? 'complete',
      depth: fields.depth ?? 0,
      budget: fields.budget ?? null,
    });
  }
}

export function buildInterproceduralTraces({ callableAnalyses, interproceduralEdges, limits, onBudgetExceeded }) {
  const nodeById = new Map();
  const incoming = new Map();
  const outgoing = new Map();
  for (const analysis of callableAnalyses) {
    for (const node of analysis.valueNodes) nodeById.set(node.valueNodeId, node);
    for (const edge of analysis.valueFlowEdges) {
      const wrapped = { ...edge, edgeType: 'intraprocedural', fromCallableId: analysis.callableId, toCallableId: analysis.callableId };
      incoming.set(edge.toValueNodeId, [...(incoming.get(edge.toValueNodeId) ?? []), wrapped]);
      outgoing.set(edge.fromValueNodeId, (outgoing.get(edge.fromValueNodeId) ?? 0) + 1);
    }
  }
  for (const edge of interproceduralEdges) {
    const wrapped = { ...edge, edgeType: 'interprocedural' };
    incoming.set(edge.toValueNodeId, [...(incoming.get(edge.toValueNodeId) ?? []), wrapped]);
    outgoing.set(edge.fromValueNodeId, (outgoing.get(edge.fromValueNodeId) ?? 0) + 1);
  }
  for (const list of incoming.values()) list.sort((a, b) => compare(a.edgeId, b.edgeId));
  const endpoints = [...nodeById.values()].filter((node) => node.boundary === 'return'
    || node.valueKind === 'state-variable' && String(node.provenance).startsWith('state-write')
    || !outgoing.has(node.valueNodeId)).sort((a, b) => compare(a.valueNodeId, b.valueNodeId));
  const traces = new Map();
  const resolvedResults = new Set(interproceduralEdges.filter((item) => item.flowKind === 'return-propagation').map((item) => item.toValueNodeId));
  let traceLimitReported = false;

  function emit(nodesReversed, edgesReversed, markers = [], forcedIncomplete = false) {
    if (!nodesReversed.length) return;
    if (traces.size >= limits.maxTraces) {
      if (!traceLimitReported) { onBudgetExceeded('trace-budget-exceeded', { limit: limits.maxTraces }); traceLimitReported = true; }
      return;
    }
    const orderedValueNodeIds = [...nodesReversed].reverse();
    const orderedEdges = [...edgesReversed].reverse();
    const pathNodes = orderedValueNodeIds.map((id) => nodeById.get(id)).filter(Boolean);
    const callableSequence = compress(pathNodes.map((item) => item.callableId));
    const depth = orderedEdges.filter((item) => item.edgeType === 'interprocedural' && item.fromCallableId !== item.toCallableId).length;
    const allMarkers = [...new Set([
      ...markers,
      ...pathNodes.flatMap((item) => [...(item.boundary ? [`boundary:${item.boundary}`] : []), ...(item.unknown && !resolvedResults.has(item.valueNodeId) ? ['unknown'] : [])]),
    ])].sort(compare);
    const status = forcedIncomplete || allMarkers.includes('unknown') || allMarkers.some((item) => item.startsWith('budget:')) ? 'incomplete' : 'complete';
    const semantic = { orderedValueNodeIds, orderedEdgeIds: orderedEdges.map((item) => item.edgeId), callableSequence, allMarkers, status, depth };
    const traceId = analysisId('interprocedural-trace', semantic);
    traces.set(traceId, new InterproceduralTrace({
      traceId,
      startCallableId: pathNodes[0]?.callableId ?? null, startValueNodeId: orderedValueNodeIds[0],
      endCallableId: pathNodes.at(-1)?.callableId ?? null, endValueNodeId: orderedValueNodeIds.at(-1),
      callableSequence, orderedValueNodeIds, orderedEdgeIds: orderedEdges.map((item) => item.edgeId),
      edgeKinds: orderedEdges.map((item) => ({ edgeId: item.edgeId, edgeType: item.edgeType, flowKind: item.flowKind })),
      callSiteLocations: orderedEdges.filter((item) => item.edgeType === 'interprocedural' && item.callSiteLocation).map((item) => locationAnchor(item.callSiteLocation)),
      calleeLocations: orderedEdges.filter((item) => item.edgeType === 'interprocedural' && item.calleeLocation).map((item) => locationAnchor(item.calleeLocation)),
      markers: allMarkers, status, depth,
      budget: { maxCallDepth: limits.maxCallDepth, maxTraces: limits.maxTraces },
    }));
  }

  function walk(currentId, nodesReversed, edgesReversed, visited, depth) {
    const predecessors = incoming.get(currentId) ?? [];
    if (!predecessors.length) { emit(nodesReversed, edgesReversed); return; }
    for (const edge of predecessors) {
      const nextDepth = depth + (edge.edgeType === 'interprocedural' && edge.fromCallableId !== edge.toCallableId ? 1 : 0);
      if (nextDepth > limits.maxCallDepth) {
        onBudgetExceeded('call-depth-limit', { limit: limits.maxCallDepth, edgeId: edge.edgeId });
        emit(nodesReversed, edgesReversed, ['budget:call-depth'], true);
        continue;
      }
      if (visited.has(edge.fromValueNodeId)) {
        emit(nodesReversed, edgesReversed, ['cycle-safe-cut']);
        continue;
      }
      walk(edge.fromValueNodeId, [...nodesReversed, edge.fromValueNodeId], [...edgesReversed, edge], new Set([...visited, edge.fromValueNodeId]), nextDepth);
    }
  }

  for (let index = 0; index < endpoints.length; index += 1) {
    if (traces.size >= limits.maxTraces) {
      if (!traceLimitReported) { onBudgetExceeded('trace-budget-exceeded', { limit: limits.maxTraces, remainingEndpoints: endpoints.length - index }); traceLimitReported = true; }
      break;
    }
    const endpoint = endpoints[index];
    walk(endpoint.valueNodeId, [endpoint.valueNodeId], [], new Set([endpoint.valueNodeId]), 0);
  }
  return [...traces.values()].sort((a, b) => compare(a.traceId, b.traceId));
}
