export class BenchmarkError extends Error { constructor(code, message, details = {}) { super(message); this.name = 'VeilForgeBenchmarkError'; this.code = code; this.safeDetails = Object.freeze({ ...details }); } }
export const benchmarkError = (code, message, details) => new BenchmarkError(code, message, details);
