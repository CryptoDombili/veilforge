import { classificationId, compare, locationAnchor } from './common.js';

export function createEvidence({ kind, origin, detail, location = null, strength = 'supporting' }) {
  const anchor = locationAnchor(location);
  return { evidenceId: classificationId('evidence', { kind, origin, detail, location: anchor, strength }), kind, origin, detail, location: anchor, strength };
}
export function sortEvidence(items) { return [...new Map(items.map((item) => [item.evidenceId, item])).values()].sort((a, b) => compare(a.evidenceId, b.evidenceId)); }
