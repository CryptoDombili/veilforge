import { classificationId, compare } from './common.js';
import { lowerConfidence } from './confidence.js';

export class CandidateTrace {
  constructor(fields = {}) { Object.assign(this, { candidateTraceId: fields.candidateTraceId, sourceCandidateId: fields.sourceCandidateId,
    sinkCandidateId: fields.sinkCandidateId, orderedValueNodeIds: fields.orderedValueNodeIds ?? [], orderedEdgeIds: fields.orderedEdgeIds ?? [],
    callableTransitions: fields.callableTransitions ?? [], declassificationDecisions: fields.declassificationDecisions ?? [],
    markers: fields.markers ?? [], complete: fields.complete !== false, incomplete: fields.complete === false, confidence: fields.confidence ?? 'low' }); }
}

export function buildCandidateTraces(analysis, sources, sinks, options = {}) {
  const maxTraces = options.maxTraces ?? analysis.budget?.limits?.maxTraces ?? 2048;
  const nodes = new Map(analysis.callableAnalyses.flatMap((item) => item.valueNodes).map((item) => [item.valueNodeId, item]));
  const edges = [...analysis.callableAnalyses.flatMap((item) => item.valueFlowEdges), ...analysis.interproceduralEdges].sort((a, b) => compare(a.edgeId, b.edgeId));
  const adjacency = new Map();
  for (const edge of edges) adjacency.set(edge.fromValueNodeId, [...(adjacency.get(edge.fromValueNodeId) ?? []), edge]);
  const result = []; let exceeded = false;
  for (const source of sources) for (const sink of sinks) {
    if (result.length >= maxTraces) { exceeded = true; break; }
    let path = null;
    if (source.valueNodeId === sink.valueNodeId) path = { ids: [source.valueNodeId], edges: [] };
    else {
      const queue = [{ id: source.valueNodeId, ids: [source.valueNodeId], edges: [] }]; const visited = new Set([source.valueNodeId]);
      while (queue.length) {
        const current = queue.shift();
        for (const edge of adjacency.get(current.id) ?? []) {
          if (visited.has(edge.toValueNodeId)) continue;
          const next = { id: edge.toValueNodeId, ids: [...current.ids, edge.toValueNodeId], edges: [...current.edges, edge] };
          if (edge.toValueNodeId === sink.valueNodeId) { path = next; queue.length = 0; break; }
          visited.add(edge.toValueNodeId); queue.push(next);
        }
      }
    }
    if (!path) continue;
    const transitions = path.edges.filter((edge) => edge.fromCallableId && edge.toCallableId && edge.fromCallableId !== edge.toCallableId)
      .map((edge) => ({ edgeId: edge.edgeId, fromCallableId: edge.fromCallableId, toCallableId: edge.toCallableId, flowKind: edge.flowKind }));
    const markers = [...new Set(path.ids.flatMap((id) => { const node = nodes.get(id); return [node?.unknown ? 'unknown' : null, node?.boundary].filter(Boolean); }))].sort(compare);
    const complete = source.complete && sink.complete && !markers.includes('unknown');
    const fields = { sourceCandidateId: source.sourceCandidateId, sinkCandidateId: sink.sinkCandidateId,
      orderedValueNodeIds: path.ids, orderedEdgeIds: path.edges.map((edge) => edge.edgeId), callableTransitions: transitions,
      markers, complete, confidence: lowerConfidence(source.confidence, sink.confidence) };
    result.push(new CandidateTrace({ ...fields, candidateTraceId: classificationId('candidate-trace', fields) }));
  }
  return { traces: result.sort((a, b) => compare(a.candidateTraceId, b.candidateTraceId)), exceeded };
}
