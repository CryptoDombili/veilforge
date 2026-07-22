import {
  DISCLAIMER,
  SCANNER_VERSION,
  SCHEMA_VERSION,
  SEVERITY_PENALTY,
  STATUS_RANK,
} from './constants.js';
import {
  canonicalReportHash,
  canonicalSourceHash,
  normalizePath,
  normalizeText,
  stableFingerprint,
} from './canonical.js';
import { parseSolidityFile } from './parser.js';
import { parseFailureFinding, runBuiltInRules, runCustomRules } from './rules.js';
import { recommendPolicies } from './policies.js';
import { buildExposureChains } from './exposure.js';

function emptySummary() {
  return { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
}

export function summarizeFindings(findings) {
  return findings.reduce((summary, finding) => {
    summary[finding.severity] += 1;
    summary.total += 1;
    return summary;
  }, emptySummary());
}

export function scoreFindings(findings) {
  const penalty = findings.reduce((total, finding) => total + (SEVERITY_PENALTY[finding.severity] ?? 0), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

export function gradeFor(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 55) return 'D';
  return 'F';
}

export function statusFor(score, summary) {
  if (summary.critical > 0) return 'Deployment Blocked';
  if (summary.high >= 2 || score < 55) return 'High Risk';
  if (summary.total > 0) return 'Review Required';
  return 'Ready';
}

function worstStatus(statuses) {
  return [...statuses].sort((a, b) => STATUS_RANK[b] - STATUS_RANK[a])[0] ?? 'Ready';
}

function contractReports(parsedFiles, findings, policies) {
  const contracts = parsedFiles.flatMap((parsed) => parsed.contracts.filter((contract) => contract.kind !== 'interface'));
  return contracts
    .map((contract) => {
      const contractFindings = findings.filter((finding) => finding.file === contract.file && finding.contractName === contract.name);
      const contractPolicies = policies.filter((policy) => policy.file === contract.file && policy.contractName === contract.name);
      const summary = summarizeFindings(contractFindings);
      const score = scoreFindings(contractFindings);
      return {
        name: contract.name,
        kind: contract.kind,
        file: contract.file,
        score,
        grade: gradeFor(score),
        status: statusFor(score, summary),
        summary,
        selectorCount: contractPolicies.length,
        policyCounts: {
          Open: contractPolicies.filter((policy) => policy.recommendation === 'Open').length,
          Restricted: contractPolicies.filter((policy) => policy.recommendation === 'Restricted').length,
          Locked: contractPolicies.filter((policy) => policy.recommendation === 'Locked').length,
        },
      };
    })
    .sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status] || a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
}

function exposureFor(parsedFiles, findings, policies, chains) {
  const variables = parsedFiles.flatMap((parsed) => parsed.stateVariables).filter((variable) => variable.contractKind !== 'interface');
  const functions = parsedFiles.flatMap((parsed) => parsed.functions).filter((fn) => fn.contractKind !== 'interface');
  return {
    sourceFiles: parsedFiles.length,
    contracts: parsedFiles.flatMap((parsed) => parsed.contracts).filter((contract) => contract.kind !== 'interface').length,
    publicStateVariables: variables.filter((variable) => variable.visibility === 'public').length,
    publicMappings: variables.filter((variable) => variable.visibility === 'public' && variable.typeName.startsWith('mapping')).length,
    externallyCallableFunctions: functions.filter((fn) => fn.functionName !== 'constructor' && (fn.visibility === 'public' || fn.visibility === 'external')).length,
    sensitiveSelectors: policies.filter((policy) => policy.recommendation !== 'Open').length,
    sensitiveEvents: new Set(findings.filter((finding) => finding.ruleId === 'VF002' || finding.ruleId === 'VF011').map((finding) => `${finding.file}:${finding.startLine}`)).size,
    crossContractFindings: findings.filter((finding) => finding.ruleId === 'VF006' || finding.ruleId === 'VF007').length,
    restrictedSelectors: policies.filter((policy) => policy.recommendation === 'Restricted').length,
    lockedSelectors: policies.filter((policy) => policy.recommendation === 'Locked').length,
    exposureChains: chains.length,
  };
}

function treatmentPlanFor(findings) {
  const priorityRank = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return findings
    .map((finding) => ({
      id: stableFingerprint(['treatment', finding.fingerprint]),
      priority: finding.priority,
      ruleId: finding.ruleId,
      title: finding.title,
      contractName: finding.contractName,
      file: finding.file,
      startLine: finding.startLine,
      severity: finding.severity,
      requiredBeforeDeploy: finding.priority === 'P0' || finding.priority === 'P1',
      action: finding.remediation,
      rationale: finding.impact,
      suggestedPolicy: finding.suggestedPolicy,
      saferPattern: finding.saferPattern,
      status: 'Open',
    }))
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.file.localeCompare(b.file) || a.startLine - b.startLine || a.ruleId.localeCompare(b.ruleId));
}

function normalizeFiles(inputFiles) {
  if (!Array.isArray(inputFiles) || inputFiles.length === 0) {
    throw new Error('At least one Solidity source file is required.');
  }
  const unique = new Map();
  for (const file of inputFiles) {
    const path = normalizePath(file.path || file.name || 'Contract.sol');
    if (!path.toLowerCase().endsWith('.sol')) continue;
    unique.set(path, { path, content: normalizeText(file.content) });
  }
  const files = [...unique.values()].sort((a, b) => a.path.localeCompare(b.path));
  if (files.length === 0) throw new Error('No .sol files were provided.');
  return files;
}

export function scanProject(inputFiles, options = {}) {
  const files = normalizeFiles(inputFiles);
  const parsedFiles = [];
  const findings = [];

  for (const file of files) {
    try {
      const parsed = parseSolidityFile(file);
      parsedFiles.push(parsed);
      findings.push(...runBuiltInRules(parsed));
    } catch (error) {
      findings.push(parseFailureFinding(file, error));
    }
  }

  findings.push(...runCustomRules(parsedFiles, options.customRules));
  const uniqueFindings = new Map();
  for (const finding of findings) uniqueFindings.set(finding.fingerprint, finding);
  const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };
  const orderedFindings = [...uniqueFindings.values()].sort((a, b) =>
    severityRank[a.severity] - severityRank[b.severity] ||
    a.file.localeCompare(b.file) ||
    a.startLine - b.startLine ||
    a.ruleId.localeCompare(b.ruleId));

  const policies = recommendPolicies(parsedFiles);
  const chains = buildExposureChains(parsedFiles, orderedFindings, policies);
  const summary = summarizeFindings(orderedFindings);
  const score = scoreFindings(orderedFindings);
  const contracts = contractReports(parsedFiles, orderedFindings, policies);
  const sourceHash = canonicalSourceHash(files);
  const status = worstStatus([statusFor(score, summary), ...contracts.map((contract) => contract.status)]);

  const withoutHash = {
    schemaVersion: SCHEMA_VERSION,
    scannerVersion: SCANNER_VERSION,
    engine: {
      mode: 'local-deterministic',
      aiApi: false,
      canonicalHash: 'keccak-256',
      ruleCount: 12 + (options.customRules?.length ?? 0),
    },
    projectId: stableFingerprint(['veilforge-project', sourceHash]),
    score,
    grade: gradeFor(score),
    status,
    summary,
    exposure: exposureFor(parsedFiles, orderedFindings, policies, chains),
    contracts,
    findings: orderedFindings,
    policies,
    exposureChains: chains,
    treatmentPlan: treatmentPlanFor(orderedFindings),
    files: files.map((file) => ({ path: file.path, lines: file.content.split('\n').length })),
    sourceHash,
    disclaimer: DISCLAIMER,
  };

  return { ...withoutHash, reportHash: canonicalReportHash(withoutHash) };
}
