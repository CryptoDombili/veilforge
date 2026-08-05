export function paymentDetector(detectorId, sinkClass, remediationKey, options = {}) {
  return Object.freeze({
    detectorId, detectorVersion: '1.0.0', domain: 'arc-payments', remediationKey,
    matches({ context, sink }) {
      if (sink.sinkClass !== sinkClass) return false;
      if (options.publicCallable) return ['public', 'external'].includes(context.callable(sink.callableId)?.visibility);
      return true;
    },
    incompleteReasons({ sink }) { return sink.complete ? [] : [sink.reason ?? 'sink-incomplete']; },
  });
}
