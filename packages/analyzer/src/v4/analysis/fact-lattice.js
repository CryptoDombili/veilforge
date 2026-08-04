function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

export function emptyState() { return new Map(); }

export function cloneState(state) {
  return new Map([...state].map(([key, fact]) => [key, {
    ...fact,
    originIds: [...fact.originIds],
    pathConditions: [...fact.pathConditions],
  }]));
}

function uniqueSorted(values) { return [...new Set(values)].sort(compare); }

function conditionKey(item) { return JSON.stringify(item); }

export function mergeFactValues(left, right) {
  if (!left) return right ? { ...right, originIds: [...right.originIds], pathConditions: [...right.pathConditions] } : null;
  if (!right) return { ...left, originIds: [...left.originIds], pathConditions: [...left.pathConditions] };
  const conditions = new Map([...left.pathConditions, ...right.pathConditions].map((item) => [conditionKey(item), item]));
  return {
    ...left,
    originIds: uniqueSorted([...left.originIds, ...right.originIds]),
    pathConditions: [...conditions.values()].sort((a, b) => compare(conditionKey(a), conditionKey(b))),
    confidence: left.confidence === right.confidence ? left.confidence : 'merged',
    provenance: left.provenance === right.provenance ? left.provenance : 'merged',
  };
}

export function joinStates(states) {
  const result = emptyState();
  for (const state of states) {
    for (const [key, fact] of [...state].sort(([a], [b]) => compare(a, b))) result.set(key, mergeFactValues(result.get(key), fact));
  }
  return result;
}

export function stateSignature(state) {
  return JSON.stringify([...state].sort(([a], [b]) => compare(a, b)).map(([key, fact]) => [
    key, [...fact.originIds].sort(compare), [...fact.pathConditions].map(conditionKey).sort(compare), fact.confidence, fact.provenance,
  ]));
}
