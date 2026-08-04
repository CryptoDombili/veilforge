import { compare } from '../classification/common.js';
import { canonicalLocation } from './locations.js';

export function mergeFindingEvidence(results, options = {}) {
  const evidence = new Map();
  for (const result of results) for (const entry of result.evidence ?? []) {
    const value = { ...entry, location: canonicalLocation(entry.location, options) };
    evidence.set(entry.detectorEvidenceId, value);
  }
  return [...evidence.values()].sort((a, b) => compare(a.detectorEvidenceId, b.detectorEvidenceId));
}
