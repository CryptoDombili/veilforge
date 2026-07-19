import { DISCLAIMER, SCANNER_VERSION, SEVERITY_PENALTY } from './constants.js';
import { parseSolidityFile } from './parser.js';
import { playbookFor } from './playbook.js';
import { recommendPolicies } from './policy.js';
import { runRules } from './rules.js';
import type {
  ExposureSurface,
  Finding,
  ParsedFile,
  PolicyRecommendation,
  ScanReport,
  SeverityTotals,
  SourceFile,
} from './types.js';
import { canonicalize, keccakHex, normalizePath, normalizeText } from './utils.js';


function exposureFor(
  parsedFiles: ParsedFile[],
  findings: Finding[],
  policies: PolicyRecommendation[],
): ExposureSurface {
  const stateVariables = parsedFiles.flatMap((parsed) => parsed.stateVariables);
  const functions = parsedFiles.flatMap((parsed) => parsed.functions);

  return {
    publicStateVariables: stateVariables.filter((variable) => variable.visibility === 'public').length,
    publicMappings: stateVariables.filter(
      (variable) => variable.visibility === 'public' && variable.typeName.startsWith('mapping('),
    ).length,
    externallyCallableFunctions: functions.filter(
      (fn) =>
        fn.functionName !== 'constructor' &&
        (fn.visibility === 'public' || fn.visibility === 'external'),
    ).length,
    sensitiveSelectors: policies.filter((policy) => policy.recommendation !== 'Open').length,
    sensitiveEvents: new Set(
      findings.filter((item) => item.ruleId === 'VF002').map((item) => `${item.file}:${item.startLine}`),
    ).size,
    crossContractFindings: findings.filter(
      (item) => item.ruleId === 'VF006' || item.ruleId === 'VF007',
    ).length,
    restrictedSelectors: policies.filter((policy) => policy.recommendation === 'Restricted').length,
    lockedSelectors: policies.filter((policy) => policy.recommendation === 'Locked').length,
  };
}

function scoreFor(findings: Finding[]): number {
  const penalty = findings.reduce((total, item) => total + SEVERITY_PENALTY[item.severity], 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

function gradeFor(score: number): ScanReport['grade'] {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 55) return 'D';
  return 'F';
}

function summaryFor(findings: Finding[]): SeverityTotals {
  return findings.reduce<SeverityTotals>(
    (totals, item) => ({ ...totals, [item.severity]: totals[item.severity] + 1 }),
    { critical: 0, high: 0, medium: 0, low: 0 },
  );
}

export function canonicalSourceHash(files: SourceFile[]): `0x${string}` {
  const payload = files
    .map((file) => ({ path: normalizePath(file.path), content: normalizeText(file.content) }))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => `${file.path}\0${file.content}\u001e`)
    .join('');
  return keccakHex(payload);
}

export function canonicalReportHash(
  report: Omit<ScanReport, 'reportHash'> | ScanReport,
): `0x${string}` {
  const stable = {
    schemaVersion: report.schemaVersion,
    scannerVersion: report.scannerVersion,
    score: report.score,
    grade: report.grade,
    summary: report.summary,
    exposure: report.exposure,
    findings: [...report.findings].sort(
      (a, b) =>
        a.file.localeCompare(b.file) || a.startLine - b.startLine || a.ruleId.localeCompare(b.ruleId),
    ),
    policies: [...report.policies].sort(
      (a, b) =>
        a.file.localeCompare(b.file) || a.startLine - b.startLine || a.signature.localeCompare(b.signature),
    ),
    files: [...report.files].sort((a, b) => a.path.localeCompare(b.path)),
    sourceHash: report.sourceHash,
    disclaimer: report.disclaimer,
  };
  return keccakHex(canonicalize(stable));
}

export function scanSources(inputFiles: SourceFile[]): ScanReport {
  if (inputFiles.length === 0) {
    throw new Error('At least one Solidity source file is required.');
  }

  const files = inputFiles
    .map((file) => ({ path: normalizePath(file.path), content: normalizeText(file.content) }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const parsedFiles: ParsedFile[] = [];
  const parseFindings: Finding[] = [];

  for (const file of files) {
    try {
      parsedFiles.push(parseSolidityFile(file));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const playbook = playbookFor('VF000');
      parseFindings.push({
        ruleId: 'VF000',
        title: 'Solidity source could not be parsed',
        description: 'VeilForge could not construct a Solidity AST, so privacy analysis for this file is incomplete.',
        severity: 'critical',
        file: file.path,
        startLine: 1,
        endLine: 1,
        evidence: message,
        remediation: 'Fix Solidity syntax or use a parser-supported language version, then scan again.',
        confidence: 'high',
        category: playbook.category,
        impact: playbook.impact,
        suggestedPolicy: playbook.suggestedPolicy,
        ...(playbook.saferPattern === undefined ? {} : { saferPattern: playbook.saferPattern }),
        fingerprint: keccakHex(`VF000|${file.path}|${message}`),
      });
    }
  }

  const findings = [...parseFindings, ...parsedFiles.flatMap(runRules)].sort(
    (a, b) =>
      SEVERITY_PENALTY[b.severity] - SEVERITY_PENALTY[a.severity] ||
      a.file.localeCompare(b.file) ||
      a.startLine - b.startLine ||
      a.ruleId.localeCompare(b.ruleId),
  );
  const policies = recommendPolicies(parsedFiles);
  const score = scoreFor(findings);
  const exposure = exposureFor(parsedFiles, findings, policies);
  const sourceHash = canonicalSourceHash(files);

  const withoutHash: Omit<ScanReport, 'reportHash'> = {
    schemaVersion: '1.1',
    scannerVersion: SCANNER_VERSION,
    score,
    grade: gradeFor(score),
    summary: summaryFor(findings),
    exposure,
    findings,
    policies,
    files: files.map((file) => ({ path: file.path, lines: file.content.split('\n').length })),
    sourceHash,
    disclaimer: DISCLAIMER,
  };

  return { ...withoutHash, reportHash: canonicalReportHash(withoutHash) };
}
