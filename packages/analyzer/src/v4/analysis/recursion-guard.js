export function recursiveCallableIds(callGraph) {
  const result = new Set();
  for (const edge of callGraph.edges ?? []) if (edge.recursive) {
    result.add(edge.callerCallableId);
    if (edge.calleeCallableId) result.add(edge.calleeCallableId);
  }
  return result;
}

export function maxAcyclicCallDepth(callGraph, allowedKinds) {
  const adjacency = new Map();
  for (const edge of callGraph.edges ?? []) {
    if (edge.resolutionStatus !== 'resolved' || !edge.calleeCallableId || !allowedKinds.has(edge.callKind)) continue;
    adjacency.set(edge.callerCallableId, [...(adjacency.get(edge.callerCallableId) ?? []), edge.calleeCallableId]);
  }
  let maximum = 0;
  function visit(id, path) {
    maximum = Math.max(maximum, path.size - 1);
    for (const next of [...new Set(adjacency.get(id) ?? [])].sort()) {
      if (path.has(next)) continue;
      visit(next, new Set([...path, next]));
    }
  }
  for (const id of [...adjacency.keys()].sort()) visit(id, new Set([id]));
  return maximum;
}
