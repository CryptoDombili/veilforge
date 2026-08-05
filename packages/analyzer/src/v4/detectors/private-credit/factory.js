function semanticIncomplete(source) {
  if (source.confidence !== 'low') return [];
  if (source.dataClass === 'customer-kyc-reference') return ['ambiguous-borrower-relationship'];
  if (source.dataClass === 'interest-rate') return ['ambiguous-interest-rate-scope'];
  if (source.dataClass === 'collateral') return ['ambiguous-collateral-relationship'];
  return [];
}
export function privateCreditDetector(detectorId, sinkClass, remediationKey, options = {}) {
  return Object.freeze({ detectorId, detectorVersion: '1.0.0', domain: 'arc-private-credit', remediationKey,
    matches(input) { if (input.sink.sinkClass !== sinkClass) return false; if (options.publicCallable && !['public','external'].includes(input.context.callable(input.sink.callableId)?.visibility)) return false; return options.matches ? options.matches(input) : true; },
    incompleteReasons(input) { return [...(input.sink.complete ? [] : [input.sink.reason ?? 'sink-incomplete']), ...semanticIncomplete(input.source), ...(options.incompleteReasons?.(input) ?? [])]; },
    evidence: options.evidence,
  });
}
export { semanticIncomplete };
