import { compareCodePoints } from '../frontend/standard-json.js';
import { deterministicId, locationAnchor } from './ids.js';
import { createGraphContext } from './graph-context.js';
import { resolveCall, shouldSkipCall } from './call-resolver.js';

export class CallEdge {
  constructor(fields) {
    Object.assign(this, {
      edgeId: fields.edgeId,
      callerCallableId: fields.callerCallableId,
      calleeCallableId: fields.calleeCallableId ?? null,
      callKind: fields.callKind,
      resolutionStatus: fields.resolutionStatus,
      location: fields.location ?? null,
      expressionAstId: fields.expressionAstId,
      candidateTargetIds: [...(fields.candidateTargetIds ?? [])],
      reason: fields.reason,
      recursive: Boolean(fields.recursive),
    });
  }
}

export class CallGraph {
  constructor(fields) { Object.assign(this, fields); }
}

function functionCalls(root) {
  const calls = [];
  const worklist = [root];
  const visited = new Set();
  while (worklist.length) {
    const node = worklist.pop();
    if (!node?.nodeType || visited.has(node.id)) continue;
    visited.add(node.id);
    if (node.nodeType === 'FunctionCall') calls.push(node);
    const children = [];
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) children.push(...value.filter((item) => item?.nodeType));
      else if (value?.nodeType) children.push(value);
    }
    for (let index = children.length - 1; index >= 0; index -= 1) worklist.push(children[index]);
  }
  return calls;
}

function markRecursiveEdges(edges) {
  const adjacency = new Map();
  for (const edge of edges) {
    if (!edge.calleeCallableId) continue;
    const targets = adjacency.get(edge.callerCallableId) ?? [];
    targets.push(edge.calleeCallableId);
    adjacency.set(edge.callerCallableId, targets);
  }
  for (const edge of edges) {
    if (!edge.calleeCallableId) continue;
    if (edge.callerCallableId === edge.calleeCallableId) { edge.recursive = true; continue; }
    const visited = new Set();
    const worklist = [edge.calleeCallableId];
    while (worklist.length) {
      const current = worklist.shift();
      if (current === edge.callerCallableId) { edge.recursive = true; break; }
      if (visited.has(current)) continue;
      visited.add(current);
      for (const target of adjacency.get(current) ?? []) if (!visited.has(target)) worklist.push(target);
    }
  }
}

function summarize(edges) {
  const byKind = {};
  const byStatus = {};
  for (const edge of edges) {
    byKind[edge.callKind] = (byKind[edge.callKind] ?? 0) + 1;
    byStatus[edge.resolutionStatus] = (byStatus[edge.resolutionStatus] ?? 0) + 1;
  }
  const sorted = (value) => Object.fromEntries(Object.entries(value).sort(([a], [b]) => compareCodePoints(a, b)));
  return { edges: edges.length, byKind: sorted(byKind), byStatus: sorted(byStatus), recursiveEdges: edges.filter((edge) => edge.recursive).length };
}

export function buildCallGraph(program, graphContext = null) {
  const context = graphContext ?? createGraphContext(program);
  const edges = [];
  for (const caller of program.declarations.filter((item) => ['function', 'modifier'].includes(item.kind)).sort((a, b) => compareCodePoints(a.canonicalName, b.canonicalName))) {
    const ast = context.callableAstById.get(caller.astNodeId);
    if (!ast?.body) continue;
    for (const call of functionCalls(ast.body)) {
      if (shouldSkipCall(call, context)) continue;
      const resolution = resolveCall(call, caller, program, context);
      const edgeId = deterministicId('call-edge', {
        callerCallableId: caller.id,
        callKind: resolution.callKind,
        calleeCallableId: resolution.calleeCallableId,
        expressionAstAnchor: locationAnchor(resolution.location),
      });
      edges.push(new CallEdge({ edgeId, callerCallableId: caller.id, expressionAstId: call.id, ...resolution }));
    }
  }
  markRecursiveEdges(edges);
  edges.sort((left, right) => compareCodePoints(left.edgeId, right.edgeId));
  return new CallGraph({
    graphId: deterministicId('call-graph', { programId: program.id }),
    programId: program.id,
    callableIds: program.declarations.filter((item) => ['function', 'modifier'].includes(item.kind)).map((item) => item.id).sort(compareCodePoints),
    edges,
    summary: summarize(edges),
  });
}
