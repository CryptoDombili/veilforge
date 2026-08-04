import { compareCodePoints } from '../frontend/standard-json.js';

function countBy(values, key) {
  const counts = {};
  for (const value of values) {
    const name = typeof key === 'function' ? key(value) : value[key];
    counts[name ?? 'unknown'] = (counts[name ?? 'unknown'] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => compareCodePoints(a, b)));
}

export function summarizeProgramIR(program) {
  return {
    sourceUnits: program.sources.length,
    contracts: program.contracts.length,
    declarations: program.declarations.length,
    declarationsByKind: countBy(program.declarations, 'kind'),
    operations: program.operations.length,
    symbols: program.symbols.length,
    symbolsByKind: countBy(program.symbols, 'kind'),
    scopes: program.scopes.length,
    scopesByType: countBy(program.scopes, 'scopeType'),
    inheritanceRelations: program.inheritance.reduce((total, item) => total + item.directBaseContractIds.length, 0),
    storageAccesses: program.storageAccesses.length,
    storageAccessesByKind: countBy(program.storageAccesses, 'accessKind'),
    unsupportedNodes: program.unsupportedNodes.length,
    unsupportedNodesByType: countBy(program.unsupportedNodes, 'nodeType'),
  };
}
