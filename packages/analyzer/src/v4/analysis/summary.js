export function summarizeCallableAnalysis(analysis) {
  const byKind = {};
  for (const node of analysis.valueNodes) byKind[node.valueKind] = (byKind[node.valueKind] ?? 0) + 1;
  return {
    facts: analysis.facts.length,
    valueNodes: analysis.valueNodes.length,
    valueNodesByKind: Object.fromEntries(Object.entries(byKind).sort(([a], [b]) => a.localeCompare(b))),
    valueFlowEdges: analysis.valueFlowEdges.length,
    traces: analysis.traces.length,
    incomplete: analysis.incomplete.length,
    iterations: analysis.iterations,
    converged: analysis.converged,
  };
}

export function summarizeProgramAnalysis(callables) {
  return {
    callables: callables.length,
    completeCallables: callables.filter((item) => item.status === 'complete').length,
    incompleteCallables: callables.filter((item) => item.status !== 'complete').length,
    facts: callables.reduce((sum, item) => sum + item.facts.length, 0),
    valueNodes: callables.reduce((sum, item) => sum + item.valueNodes.length, 0),
    valueFlowEdges: callables.reduce((sum, item) => sum + item.valueFlowEdges.length, 0),
    traces: callables.reduce((sum, item) => sum + item.traces.length, 0),
    incomplete: callables.reduce((sum, item) => sum + item.incomplete.length, 0),
  };
}
