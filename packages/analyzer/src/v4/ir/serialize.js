import { canonicalJson, compareCodePoints } from '../frontend/standard-json.js';

function plain(value) {
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  return value;
}

function byId(left, right) { return compareCodePoints(left.id ?? '', right.id ?? ''); }
function byLocation(left, right) {
  return compareCodePoints(left.sourcePath ?? '', right.sourcePath ?? '')
    || (left.location?.byteStart ?? -1) - (right.location?.byteStart ?? -1)
    || compareCodePoints(left.id ?? '', right.id ?? '');
}

export function normalizeProgramIR(program) {
  const normalized = plain(program);
  normalized.sources.sort((a, b) => compareCodePoints(a.sourcePath, b.sourcePath));
  normalized.contracts.sort((a, b) => compareCodePoints(a.canonicalName, b.canonicalName));
  normalized.declarations.sort(byId);
  normalized.operations.sort(byLocation);
  normalized.symbols.sort((a, b) => compareCodePoints(a.symbolId, b.symbolId));
  normalized.scopes.sort((a, b) => compareCodePoints(a.scopeId, b.scopeId));
  normalized.inheritance.sort((a, b) => compareCodePoints(a.contract, b.contract));
  normalized.storageAccesses.sort(byLocation);
  normalized.unsupportedNodes.sort(byLocation);
  return normalized;
}

export function serializeProgramIR(program) {
  return canonicalJson(normalizeProgramIR(program));
}
