export class AnalysisInputError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'AnalysisInputError';
    this.code = 'ANALYSIS_INPUT_ERROR';
    this.details = details;
  }
}

export class AnalysisConvergenceError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'AnalysisConvergenceError';
    this.code = 'ANALYSIS_CONVERGENCE_ERROR';
    this.details = details;
  }
}
