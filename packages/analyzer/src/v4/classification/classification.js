import { classificationId, compare } from './common.js';
import { validateAcceptedRisks } from './accepted-risk.js';
import { buildCandidateTraces } from './candidate-trace.js';
import { decideDeclassification } from './declassification.js';
import { validatePolicy } from './policy.js';
import { classifySinks } from './sink-classifier.js';
import { classifySources } from './source-classifier.js';
import { summarizeClassification } from './summary.js';
import { loadFinancialTaxonomy } from './taxonomy-loader.js';

export function analyzeFinancialClassification(program, analysis, options = {}) {
  const taxonomy = loadFinancialTaxonomy(options.taxonomy); const policy = validatePolicy(options.policy);
  const acceptedRisks = policy.valid ? validateAcceptedRisks(policy.policy, options.evaluationTime ?? new Date(0)) : [];
  const sourceCandidates = classifySources(program, analysis, taxonomy, policy); const sinkCandidates = classifySinks(program, analysis);
  const built = buildCandidateTraces(analysis, sourceCandidates, sinkCandidates, options.traceBudget ?? {});
  const declassificationDecisions = decideDeclassification(program, analysis, built.traces, sourceCandidates, sinkCandidates, policy, acceptedRisks);
  const decisionByTrace = new Map(declassificationDecisions.map((item) => [item.candidateTraceId, item.decisionId]));
  const candidateTraces = built.traces.map((item) => ({ ...item, declassificationDecisions: [decisionByTrace.get(item.candidateTraceId)].filter(Boolean) }));
  const incomplete = [...analysis.incomplete.map((item) => ({ ...item, origin: 'program-analysis' }))];
  if (!policy.valid) incomplete.push({ incompleteId: classificationId('classification-incomplete', { reason: 'policy-invalid', errors: policy.errors }), reason: 'policy-invalid', location: null, details: { errors: policy.errors }, origin: 'classification' });
  if (built.exceeded) incomplete.push({ incompleteId: classificationId('classification-incomplete', { reason: 'trace-budget-exceeded' }), reason: 'trace-budget-exceeded', location: null, details: options.traceBudget ?? {}, origin: 'classification' });
  const result = { schemaVersion: '1.0.0', engineVersion: program.engineVersion, classificationId: classificationId('classification', { programId: program.id, analysisId: analysis.analysisId, policyId: policy.policy?.policyId ?? null }),
    programId: program.id, analysisId: analysis.analysisId, taxonomy: { schemaVersion: taxonomy.schemaVersion, candidateVersion: taxonomy.candidateVersion },
    policy: { valid: policy.valid, policyId: policy.policy?.policyId ?? null, errors: policy.errors }, sourceCandidates, sinkCandidates,
    acceptedRisks, candidateTraces, declassificationDecisions, incomplete: incomplete.sort((a, b) => compare(a.incompleteId, b.incompleteId)), summary: null };
  result.summary = summarizeClassification(result); return result;
}
