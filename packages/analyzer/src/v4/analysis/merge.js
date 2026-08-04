import { joinStates } from './fact-lattice.js';

export function pathConditionForEdge(edge, blockById) {
  if (!edge?.conditionAstId) return null;
  const outcome = ['true', 'if-true', 'loop-true'].includes(edge.edgeKind) ? true
    : ['false', 'if-false', 'loop-false'].includes(edge.edgeKind) ? false : edge.edgeKind;
  return {
    branchLocation: blockById.get(edge.fromBlockId)?.location ?? null,
    conditionAstId: edge.conditionAstId,
    outcome,
    predecessorBlockId: edge.fromBlockId,
  };
}

export function stateAcrossEdge(state, edge, blockById) {
  const condition = pathConditionForEdge(edge, blockById);
  if (!condition) return state;
  return new Map([...state].map(([key, fact]) => [key, {
    ...fact,
    pathConditions: [...fact.pathConditions, condition],
  }]));
}

export function mergePredecessorStates(predecessorStates) {
  return joinStates(predecessorStates);
}
