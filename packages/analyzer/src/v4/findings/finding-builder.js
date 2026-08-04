import { classificationId, compare } from '../classification/common.js';
import { FindingV4, FINDING_VERSION } from './finding.js';
import { createFindingContext } from './finding-context.js';
import { calculateConfidence } from './confidence.js';
import { resolveSuppression, uniqueIds } from './disposition.js';
import { mergeFindingEvidence } from './evidence.js';
import { createFindingFingerprint, createFindingId, occurrenceId } from './fingerprint.js';
import { groupDetectorResults } from './grouping.js';
import { selectPrimaryLocation, uniqueLocations } from './locations.js';
import { calculateSeverity, findingCategory } from './severity.js';
import { summarizeFindings } from './summary.js';

export function buildFindingRun(input, options = {}) {
  const context = createFindingContext(input, options); const findings = [];
  for (const group of groupDetectorResults(context.results)) {
    const results = group.results; const primary = [...results].sort((a, b) => {
      const aPrimary = findingCategory(a.detectorId) === group.category; const bPrimary = findingCategory(b.detectorId) === group.category;
      return aPrimary === bPrimary ? compare(a.detectorId, b.detectorId) : aPrimary ? -1 : 1;
    })[0];
    const incompleteReasons = uniqueIds(results.flatMap((item) => item.incompleteReasons ?? [])); const complete = results.every((item) => item.complete !== false) && incompleteReasons.length === 0;
    const confidence = calculateConfidence(results, incompleteReasons); const disposition = primary.disposition;
    const fields = {
      domain: primary.domain, category: group.category, dataClass: primary.dataClass, sinkClass: primary.sinkClass, disposition,
      sourceCandidateIds: uniqueIds(results.map((item) => item.sourceCandidateId)), sinkCandidateIds: uniqueIds(results.map((item) => item.sinkCandidateId)),
      contractIds: uniqueIds(results.map((item) => item.contractId)), callableIds: uniqueIds(results.map((item) => item.callableId)),
      groupedOccurrenceIds: uniqueIds(results.map(occurrenceId)), policyRuleIds: uniqueIds(results.map((item) => item.policyRuleId)), acceptedRiskIds: uniqueIds(results.map((item) => item.acceptedRiskId)),
    };
    const fingerprint = createFindingFingerprint(fields); const detectorResultIds = uniqueIds(results.map((item) => item.detectorResultId));
    const acceptedRiskRecords = [...(options.acceptedRisks ?? []), ...results.filter((item) => item.acceptedRiskId && item.acceptedRiskMetadata).map((item) => ({ acceptedRiskId: item.acceptedRiskId, ...item.acceptedRiskMetadata }))];
    const suppression = resolveSuppression({ disposition, acceptedRiskIds: fields.acceptedRiskIds, policyRuleIds: fields.policyRuleIds, fingerprint, detectorResultIds }, { ...options, acceptedRisks: acceptedRiskRecords });
    const severity = calculateSeverity({ category: group.category, dataClass: primary.dataClass, disposition, complete, incompleteReasons, confidence });
    findings.push(new FindingV4({ ...fields, findingId: createFindingId(fingerprint), findingVersion: FINDING_VERSION, fingerprint,
      detectorId: primary.detectorId, detectorVersion: primary.detectorVersion, relatedDetectorIds: uniqueIds(results.map((item) => item.detectorId)), semanticCategories: group.semanticCategories,
      severity, confidence, titleKey: `finding.${group.category}`, remediationKey: primary.remediationKey,
      primaryLocation: selectPrimaryLocation(results, options), sourceLocations: uniqueLocations(results.map((item) => item.sourceLocation), options), sinkLocations: uniqueLocations(results.map((item) => item.sinkLocation), options),
      detectorResultIds, candidateTraceIds: uniqueIds(results.map((item) => item.candidateTraceId)), orderedEvidence: mergeFindingEvidence(results, options),
      occurrenceCount: fields.groupedOccurrenceIds.length, complete, incompleteReasons,
      declassificationDecisionIds: uniqueIds(results.map((item) => item.declassificationDecisionId)), suppression,
      summaryMetadata: { active: disposition === 'detected' && !suppression.active, observation: group.category === 'calldata-observation', semanticCategoryCount: group.semanticCategories.length },
    }));
  }
  findings.sort((a, b) => compare(a.findingId, b.findingId)); const summary = summarizeFindings(findings);
  return { schemaVersion: FINDING_VERSION, findingVersion: FINDING_VERSION, engineVersion: context.engineVersion,
    findingRunId: classificationId('finding-run', { detectorResultIds: uniqueIds(context.results.map((item) => item.detectorResultId)), findingIds: findings.map((item) => item.findingId) }), findings, summary };
}
