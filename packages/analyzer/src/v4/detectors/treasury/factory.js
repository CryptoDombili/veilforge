export function treasuryDetector(detectorId, sinkClass, remediationKey, options = {}) {
  return Object.freeze({
    detectorId, detectorVersion: '1.0.0', domain: 'arc-treasury', remediationKey,
    matches(input) {
      if (input.sink.sinkClass !== sinkClass) return false;
      if (options.publicCallable && !['public', 'external'].includes(input.context.callable(input.sink.callableId)?.visibility)) return false;
      return options.matches ? options.matches(input) : true;
    },
    incompleteReasons(input) { return [...(input.sink.complete ? [] : [input.sink.reason ?? 'sink-incomplete']), ...(options.incompleteReasons?.(input) ?? [])]; },
    evidence: options.evidence,
  });
}
