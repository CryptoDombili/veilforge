import { analysisId } from './value-node.js';

export const DEFAULT_ANALYSIS_BUDGET = Object.freeze({
  maxCallDepth: 16,
  maxCallableRevisits: 32,
  maxPropagatedFacts: 10_000,
  maxInterproceduralEdges: 10_000,
  maxTraces: 2_048,
});

export class AnalysisBudget {
  constructor(fields = {}) {
    const limits = { ...DEFAULT_ANALYSIS_BUDGET, ...(fields.limits ?? fields) };
    Object.assign(this, {
      limits,
      used: {
        callableRevisits: fields.used?.callableRevisits ?? 0,
        propagatedFacts: fields.used?.propagatedFacts ?? 0,
        interproceduralEdges: fields.used?.interproceduralEdges ?? 0,
        traces: fields.used?.traces ?? 0,
        maxObservedCallDepth: fields.used?.maxObservedCallDepth ?? 0,
      },
      exceeded: [...(fields.exceeded ?? [])],
      complete: fields.complete !== false,
    });
  }
}

export class ProgramAnalysis {
  constructor(fields = {}) {
    Object.assign(this, {
      schemaVersion: fields.schemaVersion ?? '1.0.0',
      engineVersion: fields.engineVersion,
      analysisId: fields.analysisId,
      programId: fields.programId,
      callableAnalyses: fields.callableAnalyses ?? [],
      callSummaries: fields.callSummaries ?? [],
      callBoundaries: fields.callBoundaries ?? [],
      interproceduralEdges: fields.interproceduralEdges ?? [],
      traces: fields.traces ?? [],
      incomplete: fields.incomplete ?? [],
      budget: fields.budget ?? new AnalysisBudget(),
      summary: fields.summary ?? null,
    });
  }
}

export function createProgramAnalysisId(programId, intraproceduralAnalysisId, limits) {
  return analysisId('interprocedural-program-analysis', { programId, intraproceduralAnalysisId, limits });
}
