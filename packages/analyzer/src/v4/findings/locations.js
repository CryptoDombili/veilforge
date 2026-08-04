import { compare } from '../classification/common.js';

export function canonicalSourcePath(value, projectRoot = null) {
  let path = String(value ?? '').replace(/^\uFEFF/u, '').replace(/\\/gu, '/');
  const root = String(projectRoot ?? '').replace(/\\/gu, '/').replace(/\/$/u, '');
  if (root && path.toLowerCase().startsWith(`${root.toLowerCase()}/`)) path = path.slice(root.length + 1);
  return path.replace(/^\.\//u, '');
}

export function canonicalLocation(location, options = {}) {
  if (!location) return null;
  return { sourcePath: canonicalSourcePath(location.sourcePath, options.projectRoot), byteStart: Number(location.byteStart ?? 0), byteEnd: Number(location.byteEnd ?? location.byteStart ?? 0) };
}

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
