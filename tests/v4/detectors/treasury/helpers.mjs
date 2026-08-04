import { classify, policy as basePolicy, taxonomy } from '../../classification/helpers.mjs';
import { compileProject } from '../../../../packages/analyzer/src/v4/frontend/index.js';
import { buildProgramGraphs, lowerCompilationToIR } from '../../../../packages/analyzer/src/v4/ir/index.js';
import { analyzeProgramDataflow, analyzeProgramInterprocedural } from '../../../../packages/analyzer/src/v4/analysis/index.js';
import { analyzeFinancialClassification } from '../../../../packages/analyzer/src/v4/classification/index.js';
import { createTreasuryDetectorRegistry, runDetectors } from '../../../../packages/analyzer/src/v4/detectors/index.js';
export const policy = Object.freeze({ ...basePolicy, policyId: 'treasury-detector-test', domain: 'arc-treasury' });
export function detect(source, policyOverride = policy, options = {}) {
  const built = classify(source, policyOverride, options); const detectorRun = runDetectors(built.classification, createTreasuryDetectorRegistry(), { program: built.ir });
  return { ...built, detectorRun };
}
export function results(run, suffix) { return run.results.filter((item) => item.detectorId.endsWith(suffix)); }
export function detectSources(sources, policyOverride = policy) {
  const compilation = compileProject({ sources }); if (compilation.result.status !== 'compiled') throw new Error(compilation.result.diagnostics.map((item) => item.formattedMessage).join('\n'));
  const ir = lowerCompilationToIR(compilation); const graphs = buildProgramGraphs(ir); const intra = analyzeProgramDataflow(ir, graphs); const analysis = analyzeProgramInterprocedural(ir, graphs, intra);
  const classification = analyzeFinancialClassification(ir, analysis, { taxonomy, policy: policyOverride, evaluationTime: '2026-08-04T00:00:00Z' });
  return runDetectors(classification, createTreasuryDetectorRegistry(), { program: ir });
}
