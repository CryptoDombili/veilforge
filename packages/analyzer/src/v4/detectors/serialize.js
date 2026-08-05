import { canonicalJson, compareCodePoints } from '../frontend/standard-json.js';
function plain(value) { if (Array.isArray(value)) return value.map(plain); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)])); return value; }
export function normalizeDetectorRun(run) { const value = plain(run); value.results.sort((a, b) => compareCodePoints(a.detectorResultId, b.detectorResultId)); for (const result of value.results) { result.evidence.sort((a, b) => compareCodePoints(a.detectorEvidenceId, b.detectorEvidenceId)); result.incompleteReasons.sort(compareCodePoints); } return value; }
export function serializeDetectorRun(run) { return canonicalJson(normalizeDetectorRun(run)); }
