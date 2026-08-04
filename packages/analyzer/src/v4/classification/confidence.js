export const CONFIDENCE = Object.freeze({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low', INCOMPLETE: 'incomplete' });
const rank = { incomplete: 0, low: 1, medium: 2, high: 3 };
export function lowerConfidence(left, right) { return rank[left] <= rank[right] ? left : right; }
