import { analysisId } from './value-node.js';

function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

export class CallableSummary {
  constructor(fields = {}) {
    Object.assign(this, {
      summaryId: fields.summaryId,
      callableId: fields.callableId,
      parameterReturns: fields.parameterReturns ?? [],
      parameterStateWrites: fields.parameterStateWrites ?? [],
      stateReadReturns: fields.stateReadReturns ?? [],
      unknownBoundaryIds: fields.unknownBoundaryIds ?? [],
      incompleteReasons: fields.incompleteReasons ?? [],
      sideEffectStoragePaths: fields.sideEffectStoragePaths ?? [],
      recursive: Boolean(fields.recursive),
    });
  }
}

export function buildAdjacency(callableAnalyses, interproceduralEdges) {
  const adjacency = new Map();
  const add = (from, to) => adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
  for (const analysis of callableAnalyses) for (const edge of analysis.valueFlowEdges) add(edge.fromValueNodeId, edge.toValueNodeId);
  for (const edge of interproceduralEdges) add(edge.fromValueNodeId, edge.toValueNodeId);
  for (const [key, values] of adjacency) adjacency.set(key, [...new Set(values)].sort(compare));
  return adjacency;
}

export function reachableFrom(startId, adjacency, limit = 100_000) {
  const visited = new Set();
  const worklist = [startId];
  while (worklist.length && visited.size < limit) {
    const current = worklist.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    worklist.push(...(adjacency.get(current) ?? []).filter((item) => !visited.has(item)));
  }
  return visited;
}

export function createCallableSummary(analysis, adjacency, recursive, boundaries = [], options = {}) {
  const parameters = analysis.valueNodes.filter((item) => item.valueKind === 'parameter').sort((a, b) => compare(a.valueNodeId, b.valueNodeId));
  const returns = analysis.valueNodes.filter((item) => item.boundary === 'return').sort((a, b) => compare(a.valueNodeId, b.valueNodeId));
  const stateWrites = analysis.valueNodes.filter((item) => item.valueKind === 'state-variable' && String(item.provenance).startsWith('state-write')).sort((a, b) => compare(a.valueNodeId, b.valueNodeId));
  const stateReads = analysis.valueNodes.filter((item) => item.valueKind === 'state-variable' && item.provenance === 'state-read').sort((a, b) => compare(a.valueNodeId, b.valueNodeId));
  const parameterReturns = [];
  const parameterStateWrites = [];
  for (const parameter of parameters) {
    const reachable = reachableFrom(parameter.valueNodeId, adjacency);
    const returnValueNodeIds = returns.filter((item) => reachable.has(item.valueNodeId)).map((item) => item.valueNodeId);
    const stateWriteValueNodeIds = stateWrites.filter((item) => reachable.has(item.valueNodeId)).map((item) => item.valueNodeId);
    if (returnValueNodeIds.length) parameterReturns.push({ parameterSymbolId: parameter.symbolId, parameterValueNodeId: parameter.valueNodeId, returnValueNodeIds });
    if (stateWriteValueNodeIds.length) parameterStateWrites.push({ parameterSymbolId: parameter.symbolId, parameterValueNodeId: parameter.valueNodeId, stateWriteValueNodeIds });
  }
  const stateReadReturns = [];
  for (const read of stateReads) {
    const reachable = reachableFrom(read.valueNodeId, adjacency);
    const returnValueNodeIds = returns.filter((item) => reachable.has(item.valueNodeId)).map((item) => item.valueNodeId);
    if (returnValueNodeIds.length) stateReadReturns.push({ stateReadValueNodeId: read.valueNodeId, storagePath: read.storagePath, returnValueNodeIds });
  }
  const sideEffectStoragePaths = [...new Map(stateWrites.map((item) => [JSON.stringify({ symbolId: item.symbolId, storagePath: item.storagePath }), {
    symbolId: item.symbolId, storagePath: item.storagePath,
  }])).values()].sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)));
  const resolvedValueNodeIds = options.resolvedValueNodeIds ?? new Set();
  const resolvedCallAstIds = options.resolvedCallAstIds ?? new Set();
  const unknownBoundaryIds = analysis.valueNodes.filter((item) => (item.unknown && !resolvedValueNodeIds.has(item.valueNodeId))
    || item.boundary === 'inline-assembly').map((item) => item.valueNodeId).sort(compare);
  const incompleteReasons = [...new Set([
    ...analysis.incomplete.filter((item) => !(item.reason === 'call-result-not-propagated-interprocedurally' && resolvedCallAstIds.has(item.astNodeId))).map((item) => item.reason),
    ...boundaries.filter((item) => item.callerCallableId === analysis.callableId && item.propagationStatus !== 'propagated').map((item) => item.reason),
  ])].sort(compare);
  const semantic = {
    callableId: analysis.callableId, parameterReturns, parameterStateWrites, stateReadReturns,
    unknownBoundaryIds, incompleteReasons, sideEffectStoragePaths, recursive,
  };
  return new CallableSummary({ summaryId: analysisId('callable-summary', semantic), ...semantic });
}
