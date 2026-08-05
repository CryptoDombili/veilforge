import { analysisId, locationAnchor } from './value-node.js';

function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

export class FlowTrace {
  constructor(fields = {}) {
    Object.assign(this, {
      traceId: fields.traceId,
      callableId: fields.callableId,
      startValueNodeId: fields.startValueNodeId,
      endValueNodeId: fields.endValueNodeId,
      orderedNodeIds: [...(fields.orderedNodeIds ?? [])],
      orderedEdgeIds: [...(fields.orderedEdgeIds ?? [])],
      sourceLocations: [...(fields.sourceLocations ?? [])],
      markers: [...(fields.markers ?? [])],
      status: fields.status ?? 'complete',
    });
  }
}

export function buildFlowTraces({ callableId, valueNodes, valueFlowEdges, incomplete = [], maxDepth = 128, maxTraces = 2048 }) {
  const nodeById = new Map(valueNodes.map((item) => [item.valueNodeId, item]));
  const incoming = new Map();
  const outgoing = new Map();
  for (const edge of valueFlowEdges) {
    const list = incoming.get(edge.toValueNodeId) ?? [];
    list.push(edge);
    incoming.set(edge.toValueNodeId, list);
    outgoing.set(edge.fromValueNodeId, (outgoing.get(edge.fromValueNodeId) ?? 0) + 1);
  }
  for (const list of incoming.values()) list.sort((a, b) => compare(a.edgeId, b.edgeId));
  const endpoints = valueNodes.filter((node) => node.boundary
    || ['return-parameter', 'state-variable', 'local-variable', 'unknown'].includes(node.valueKind)
    || !outgoing.has(node.valueNodeId)).sort((a, b) => compare(a.valueNodeId, b.valueNodeId));
  const traces = new Map();

  function emit(nodesReversed, edgesReversed, truncated = false) {
    if (!nodesReversed.length || traces.size >= maxTraces) return;
    const orderedNodeIds = [...nodesReversed].reverse();
    const orderedEdgeIds = [...edgesReversed].reverse();
    const pathNodes = orderedNodeIds.map((id) => nodeById.get(id)).filter(Boolean);
    const markers = pathNodes.flatMap((node) => [
      ...(node.boundary ? [`boundary:${node.boundary}`] : []),
      ...(node.unknown ? ['unknown'] : []),
    ]);
    if (truncated) markers.push('bounded-trace');
    const status = truncated || pathNodes.some((node) => node.unknown)
      || incomplete.some((item) => orderedNodeIds.includes(item.details?.unknownValueNodeId)) ? 'incomplete' : 'complete';
    const semantic = { callableId, orderedNodeIds, orderedEdgeIds, markers: [...new Set(markers)].sort(compare), status };
    const traceId = analysisId('flow-trace', semantic);
    traces.set(traceId, new FlowTrace({
      traceId, callableId, startValueNodeId: orderedNodeIds[0], endValueNodeId: orderedNodeIds.at(-1),
      orderedNodeIds, orderedEdgeIds,
      sourceLocations: pathNodes.map((node) => node.location).filter(Boolean).map(locationAnchor),
      markers: semantic.markers, status,
    }));
  }

  function walk(currentId, nodesReversed, edgesReversed, visited) {
    const predecessors = incoming.get(currentId) ?? [];
    if (!predecessors.length) { emit(nodesReversed, edgesReversed); return; }
    if (nodesReversed.length >= maxDepth) { emit(nodesReversed, edgesReversed, true); return; }
    for (const edge of predecessors) {
      if (visited.has(edge.fromValueNodeId)) { emit(nodesReversed, edgesReversed, true); continue; }
      walk(edge.fromValueNodeId, [...nodesReversed, edge.fromValueNodeId], [...edgesReversed, edge.edgeId], new Set([...visited, edge.fromValueNodeId]));
    }
  }

  for (const endpoint of endpoints) {
    walk(endpoint.valueNodeId, [endpoint.valueNodeId], [], new Set([endpoint.valueNodeId]));
    if (traces.size >= maxTraces) break;
  }
  return [...traces.values()].sort((a, b) => compare(a.traceId, b.traceId));
}
