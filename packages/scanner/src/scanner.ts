import { BUILT_IN_RULE_IDS, DISCLAIMER, SCANNER_VERSION, SEVERITY_PENALTY } from './constants.js';
import { runCustomRules } from './custom-rules.js';
import {
  buildContractSummaries,
  buildExposureChains,
  buildProjectTriage,
  buildTreatmentPlan,
  gradeForScore,
  scoreForFindings,
  summaryForFindings,
} from './mission.js';
import { parseSolidityFile } from './parser.js';
import { playbookFor } from './playbook.js';
import { recommendPolicies } from './policy.js';
import { runRules } from './rules.js';
import type {
  ExposureSurface,
  Finding,
  ParsedFile,
  PolicyRecommendation,
  ScanOptions,
  ScanReport,
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
      findings
        .filter((item) => item.ruleId === 'VF002' || item.ruleId === 'VF011')
        .map((item) => `${item.file}:${item.startLine}`),
    ).size,
    crossContractFindings: findings.filter(
      (item) => item.ruleId === 'VF006' || item.ruleId === 'VF007',
    ).length,
    restrictedSelectors: policies.filter((policy) => policy.recommendation === 'Restricted').length,
    lockedSelectors: policies.filter((policy) => policy.recommendation === 'Locked').length,
  };
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
    analysisProfile: report.analysisProfile,
    score: report.score,
    grade: report.grade,
    summary: report.summary,
    exposure: report.exposure,
    findings: [...report.findings].sort(
      (a, b) =>
        a.file.localeCompare(b.file) ||
        a.startLine - b.startLine ||
        a.ruleId.localeCompare(b.ruleId),
    ),
    policies: [...report.policies].sort(
      (a, b) =>
        a.file.localeCompare(b.file) ||
        a.startLine - b.startLine ||
        a.signature.localeCompare(b.signature),
    ),
    contracts: [...report.contracts].sort(
      (a, b) => a.file.localeCompare(b.file) || a.startLine - b.startLine,
    ),
    triage: report.triage,
    exposureChains: [...report.exposureChains].sort((a, b) => a.id.localeCompare(b.id)),
    treatmentPlan: [...report.treatmentPlan].sort((a, b) => a.order - b.order),
    files: [...report.files].sort((a, b) => a.path.localeCompare(b.path)),
    sourceHash: report.sourceHash,
    disclaimer: report.disclaimer,
  };
  return keccakHex(canonicalize(stable));
}

export function scanSources(inputFiles: SourceFile[], options: ScanOptions = {}): ScanReport {
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
        description:
          'VeilForge could not construct a Solidity AST, so privacy analysis for this file is incomplete.',
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

  const customFindings = options.customRules ? runCustomRules(files, options.customRules) : [];
  const findings = [...parseFindings, ...parsedFiles.flatMap(runRules), ...customFindings].sort(
    (a, b) =>
      SEVERITY_PENALTY[b.severity] - SEVERITY_PENALTY[a.severity] ||
      a.file.localeCompare(b.file) ||
      a.startLine - b.startLine ||
      a.ruleId.localeCompare(b.ruleId),
  );
  const policies = recommendPolicies(parsedFiles);
  const score = scoreForFindings(findings);
  const exposure = exposureFor(parsedFiles, findings, policies);
  const contracts = buildContractSummaries(parsedFiles, findings, policies);
  const triage = buildProjectTriage(score, findings, contracts);
  const exposureChains = buildExposureChains(parsedFiles, findings, policies);
  const treatmentPlan = buildTreatmentPlan(parsedFiles, findings);
  const sourceHash = canonicalSourceHash(files);

  const withoutHash: Omit<ScanReport, 'reportHash'> = {
    schemaVersion: '1.8',
    scannerVersion: SCANNER_VERSION,
    analysisProfile: {
      engine: 'veilforge-deterministic',
      execution: 'local',
      aiApiUsed: false,
      hashAlgorithm: 'keccak256',
      builtInRuleIds: [...BUILT_IN_RULE_IDS],
      customRuleIds: [...new Set((options.customRules ?? []).map((rule) => rule.id))].sort(),
    },
    score,
    grade: gradeForScore(score),
    summary: summaryForFindings(findings),
    exposure,
    findings,
    policies,
    contracts,
    triage,
    exposureChains,
    treatmentPlan,
    files: files.map((file) => ({ path: file.path, lines: file.content.split('\n').length })),
    sourceHash,
    disclaimer: DISCLAIMER,
  };

  return { ...withoutHash, reportHash: canonicalReportHash(withoutHash) };
}

/** Analyze a Solidity project using the canonical deterministic engine. */
export const analyzeProject = scanSources;

/** Convenience wrapper for a single Solidity source string. */
export function analyzeSolidity(source: string, path = 'Contract.sol', options: ScanOptions = {}): ScanReport {
  return scanSources([{ path, content: source }], options);
}
