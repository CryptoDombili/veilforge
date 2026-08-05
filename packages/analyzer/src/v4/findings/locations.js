import { compare } from '../classification/common.js';

export function canonicalSourcePath(value, projectRoot = null) {
  let path = String(value ?? '').replace(/^\uFEFF/u, '').replace(/\\/gu, '/');
  const root = String(projectRoot ?? '').replace(/\\/gu, '/').replace(/\/$/u, '');
  if (root && path.toLowerCase().startsWith(`${root.toLowerCase()}/`)) path = path.slice(root.length + 1);
  return path.replace(/^\.\//u, '');
}

export function canonicalLocation(location, options = {}) {
  if (!location) return null;
  const byteStart = Number(location.startByte ?? location.byteStart ?? 0);
  const byteEnd = Number(location.endByte ?? location.byteEnd ?? location.startByte ?? location.byteStart ?? 0);
  const value = { sourcePath: canonicalSourcePath(location.sourcePath, options.projectRoot), startByte: byteStart, endByte: byteEnd, byteStart, byteEnd };
  const fields = [['startLine', 'lineStart'], ['startColumn', 'columnStart'], ['endLine', 'lineEnd'], ['endColumn', 'columnEnd']];
  for (const [name, legacy] of fields) { const item = location[name] ?? location[legacy]; if (Number.isInteger(item) && item > 0) value[name] = item; }
  for (const name of ['sourceId', 'contractId', 'callableId', 'declarationId']) if (location[name] !== undefined && location[name] !== null) value[name] = location[name];
  if (location.locationStatus) value.locationStatus = location.locationStatus;
  return value;
}

export function contextualLocation(location, context = {}, options = {}) { const value = canonicalLocation(location, options); if (!value) return null; for (const name of ['contractId', 'callableId', 'declarationId']) if (context[name]) value[name] = context[name]; return value; }

export function compareLocations(left, right) {
  return compare(left.sourcePath, right.sourcePath) || left.byteStart - right.byteStart || left.byteEnd - right.byteEnd;
}

export function uniqueLocations(locations, options = {}) {
  const map = new Map();
  for (const value of locations) { const location = canonicalLocation(value, options); if (location) map.set(`${location.sourcePath}:${location.byteStart}:${location.byteEnd}`, location); }
  return [...map.values()].sort(compareLocations);
}

export function selectPrimaryLocation(results, options = {}) {
  const tiers = [
    results.map((item) => item.sinkLocation),
    results.map((item) => item.sourceLocation),
    results.flatMap((item) => (item.evidence ?? []).filter((entry) => entry.kind === 'callable-transition' || entry.kind === 'boundary').map((entry) => entry.location)),
    results.map((item) => item.primaryLocation),
  ];
  for (const tier of tiers) { const values = uniqueLocations(tier, options); if (values.length) return values[0]; }
  return null;
}
