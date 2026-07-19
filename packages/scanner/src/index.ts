export { scanSources, canonicalReportHash, canonicalSourceHash } from './scanner.js';
export { formatMarkdownReport, formatTextReport } from './format.js';
export { SCANNER_VERSION, DISCLAIMER } from './constants.js';
export type {
  AccessPolicy,
  Confidence,
  ExposureSurface,
  Finding,
  FindingCategory,
  PolicyRecommendation,
  ScanReport,
  Severity,
  SourceFile,
} from './types.js';
