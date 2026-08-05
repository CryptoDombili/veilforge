const SOURCES = Object.freeze({
  'arc-payments': Object.freeze(['amount','beneficiary','customer-kyc-reference','invoice-reference','payee','payer','settlement-reference','supplier']),
  'arc-treasury': Object.freeze(['amount','beneficiary','employee-payroll','invoice-reference','settlement-reference','supplier','treasury-operator']),
  'arc-private-credit': Object.freeze(['beneficiary','collateral','customer-kyc-reference','interest-rate','loan-terms','settlement-reference']),
});
const ALL_SINKS = Object.freeze(['calldata','event','external-call','metadata-uri','public-getter','public-storage','return','revert-custom-error']);
const SINK_BY_CATEGORY = Object.freeze({
  'calldata-observation': ['calldata'], 'event-disclosure': ['event'], 'external-call-disclosure': ['external-call'],
  'metadata-disclosure': ['metadata-uri'], 'public-getter-disclosure': ['public-getter'], 'public-storage-disclosure': ['public-storage'],
  'return-disclosure': ['return'], 'revert-disclosure': ['revert-custom-error'],
});
export function detectorMetadata(detector) {
  const detectorId = detector?.detectorId; const domain = detector?.domain; const category = String(detectorId ?? '').split('.').at(-1);
  if (!detectorId || !SOURCES[domain] || !category) throw new TypeError('Detector metadata requires a registered stable detector identity.');
  return Object.freeze({ detectorId, detectorVersion: detector.detectorVersion ?? '1.0.0', domain, category, stableRuleKey: detectorId, titleKey: `finding.${category}`, sourceClasses: SOURCES[domain], sinkClasses: Object.freeze([...(SINK_BY_CATEGORY[category] ?? ALL_SINKS)]) });
}
export function detectorCatalog(detectors) { return Object.freeze([...detectors].map(detectorMetadata).sort((a,b)=>a.detectorId.localeCompare(b.detectorId))); }
