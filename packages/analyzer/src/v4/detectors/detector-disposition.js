export const DETECTOR_DISPOSITIONS = Object.freeze(['detected', 'policy-approved', 'accepted-risk', 'incomplete', 'not-applicable']);

export function detectorDisposition({ trace, source, sink, decision, acceptedRisk, globalIncomplete = [] }) {
  const reasons = [...new Set([
    ...(trace.complete ? [] : ['trace-incomplete']),
    ...(source.complete ? [] : [source.reason ?? 'source-incomplete']),
    ...(sink.complete ? [] : [sink.reason ?? 'sink-incomplete']),
    ...globalIncomplete,
  ])].sort();
  if (reasons.length) return { disposition: 'incomplete', complete: false, incompleteReasons: reasons };
  if (decision?.decision === 'approved' && decision.reason === 'valid-accepted-risk-disposition' && acceptedRisk?.valid) {
    return { disposition: 'accepted-risk', complete: true, incompleteReasons: [] };
  }
  if (decision?.decision === 'approved') return { disposition: 'policy-approved', complete: true, incompleteReasons: [] };
  return { disposition: 'detected', complete: true, incompleteReasons: [] };
}
