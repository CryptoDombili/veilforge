import { SEVERITY_PENALTY } from './constants.js';
import type {
  AccessPolicy,
  ContractSummary,
  ExposureChain,
  ExposureNode,
  Finding,
  FindingCategory,
  ParsedContract,
  ParsedFile,
  PolicyManifest,
  PolicyRecommendation,
  ProjectTriage,
  ScanComparison,
  ScanReport,
  Severity,
  SeverityTotals,
  TreatmentPlanItem,
  TriageStatus,
} from './types.js';
import { containsSensitiveTerm, keccakHex } from './utils.js';

const severityOrder: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const priorityFor: Record<Severity, TreatmentPlanItem['priority']> = {
  critical: 'P0',
  high: 'P1',
  medium: 'P2',
  low: 'P3',
};

function emptySummary(): SeverityTotals {
  return { critical: 0, high: 0, medium: 0, low: 0 };
}

export function summaryForFindings(findings: Finding[]): SeverityTotals {
  return findings.reduce<SeverityTotals>(
    (totals, finding) => ({ ...totals, [finding.severity]: totals[finding.severity] + 1 }),
    emptySummary(),
  );
}

export function scoreForFindings(findings: Finding[]): number {
  const penalty = findings.reduce((total, finding) => total + SEVERITY_PENALTY[finding.severity], 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

export function gradeForScore(score: number): ScanReport['grade'] {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 55) return 'D';
  return 'F';
}

export function statusFor(summary: SeverityTotals, score: number): TriageStatus {
  if (summary.critical > 0) return 'deployment-blocked';
  if (summary.high > 0 || score < 70) return 'high-risk';
  if (summary.medium > 0 || summary.low > 0 || score < 90) return 'review-required';
  return 'ready';
}

function contractForFinding(parsedFiles: ParsedFile[], finding: Finding): ParsedContract | undefined {
  return parsedFiles
    .flatMap((parsed) => parsed.contracts)
    .find(
      (contract) =>
        contract.file === finding.file &&
        finding.startLine >= contract.startLine &&
        finding.startLine <= contract.endLine,
    );
}

export function buildContractSummaries(
  parsedFiles: ParsedFile[],
  findings: Finding[],
  policies: PolicyRecommendation[],
): ContractSummary[] {
  const functions = parsedFiles.flatMap((parsed) => parsed.functions);

  return parsedFiles
    .flatMap((parsed) => parsed.contracts)
    .map((contract) => {
      const contractFindings = findings.filter(
        (finding) =>
          finding.file === contract.file &&
          finding.startLine >= contract.startLine &&
          finding.startLine <= contract.endLine,
      );
      const contractPolicies = policies.filter(
        (policy) => policy.file === contract.file && policy.contractName === contract.name,
      );
      const score = scoreForFindings(contractFindings);
      const summary = summaryForFindings(contractFindings);
      return {
        id: keccakHex(`${contract.file}|${contract.name}|${contract.startLine}`),
        file: contract.file,
        contractName: contract.name,
        startLine: contract.startLine,
        endLine: contract.endLine,
        score,
        grade: gradeForScore(score),
        status: statusFor(summary, score),
        summary,
        findingCount: contractFindings.length,
        externallyCallableFunctions: functions.filter(
          (fn) =>
            fn.file === contract.file &&
            fn.contractName === contract.name &&
            fn.functionName !== 'constructor' &&
            (fn.visibility === 'public' || fn.visibility === 'external'),
        ).length,
        sensitiveSelectors: contractPolicies.filter((policy) => policy.recommendation !== 'Open').length,
        topFindingFingerprints: contractFindings.slice(0, 3).map((finding) => finding.fingerprint),
      };
    })
    .sort(
      (a, b) =>
        a.score - b.score ||
        b.findingCount - a.findingCount ||
        a.file.localeCompare(b.file) ||
        a.contractName.localeCompare(b.contractName),
    );
}

export function buildProjectTriage(
  score: number,
  findings: Finding[],
  contracts: ContractSummary[],
): ProjectTriage {
  const summary = summaryForFindings(findings);
  const status = statusFor(summary, score);
  const categoryCounts = findings.reduce<Map<FindingCategory, number>>((counts, finding) => {
    counts.set(finding.category, (counts.get(finding.category) ?? 0) + 1);
    return counts;
  }, new Map());
  const topRiskCategories = [...categoryCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
    .slice(0, 4);

  const explanation: Record<TriageStatus, string> = {
    ready: 'No deterministic rule matched. Manual review is still required before deployment.',
    'review-required': 'Non-blocking exposure signals remain and should be reviewed before production.',
    'high-risk': 'High-severity disclosure paths remain. Remediation is strongly recommended before deployment.',
    'deployment-blocked': 'Critical privacy exposure was detected. VeilForge recommends blocking deployment until the listed P0 actions are addressed.',
  };

  return {
    status,
    deploymentAllowed: status !== 'deployment-blocked',
    blockerFingerprints: findings
      .filter((finding) => finding.severity === 'critical')
      .map((finding) => finding.fingerprint),
    contractsAtRisk: contracts.filter((contract) => contract.status !== 'ready').length,
    topRiskCategories,
    explanation: explanation[status],
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasIdentifier(source: string, identifier: string): boolean {
  return new RegExp(`\\b${escapeRegExp(identifier)}\\b`).test(source);
}

function highestSeverity(findings: Finding[], fallback: Severity): Severity {
  return findings.reduce<Severity>(
    (highest, finding) =>
      severityOrder[finding.severity] > severityOrder[highest] ? finding.severity : highest,
    fallback,
  );
}

function node(
  kind: ExposureNode['kind'],
  label: string,
  detail: string,
  file: string,
  startLine: number,
  endLine = startLine,
): ExposureNode {
  return {
    id: keccakHex(`${kind}|${file}|${startLine}|${label}`),
    kind,
    label,
    detail,
    file,
    startLine,
    endLine,
  };
}

export function buildExposureChains(
  parsedFiles: ParsedFile[],
  findings: Finding[],
  policies: PolicyRecommendation[],
): ExposureChain[] {
  const chains: ExposureChain[] = [];

  for (const parsed of parsedFiles) {
    for (const fn of parsed.functions) {
      if (
        fn.functionName === 'constructor' ||
        (fn.visibility !== 'public' && fn.visibility !== 'external')
      ) {
        continue;
      }

      const stateVariables = parsed.stateVariables.filter(
        (variable) =>
          variable.contractName === fn.contractName &&
          containsSensitiveTerm(`${variable.name} ${variable.typeName}`) &&
          hasIdentifier(fn.source, variable.name),
      );
      const emittedEvents = parsed.events.filter(
        (event) =>
          event.contractName === fn.contractName &&
          new RegExp(`\\bemit\\s+${escapeRegExp(event.name)}\\b`).test(fn.source),
      );
      const relatedFindings = findings.filter((finding) => {
        if (finding.file !== fn.file) return false;
        const overlapsFunction = finding.startLine >= fn.startLine && finding.startLine <= fn.endLine;
        const matchesState = stateVariables.some(
          (variable) => finding.startLine >= variable.startLine && finding.startLine <= variable.endLine,
        );
        const matchesEvent = emittedEvents.some(
          (event) => finding.startLine >= event.startLine && finding.startLine <= event.endLine,
        );
        return overlapsFunction || matchesState || matchesEvent;
      });
      const policy = policies.find(
        (item) => item.file === fn.file && item.contractName === fn.contractName && item.signature === fn.signature,
      );

      if (
        stateVariables.length === 0 &&
        emittedEvents.length === 0 &&
        relatedFindings.length === 0 &&
        policy?.recommendation === 'Open'
      ) {
        continue;
      }

      const nodes: ExposureNode[] = [];
      stateVariables.forEach((variable) => {
        nodes.push(
          node(
            'storage',
            variable.name,
            `${variable.visibility} ${variable.typeName}`,
            variable.file,
            variable.startLine,
            variable.endLine,
          ),
        );
      });
      nodes.push(
        node(
          'function',
          fn.functionName,
          `${fn.visibility} ${fn.stateMutability}`,
          fn.file,
          fn.startLine,
          fn.endLine,
        ),
      );
      emittedEvents.forEach((event) => {
        nodes.push(
          node(
            'event',
            event.name,
            'Public log surface observed in this function body',
            event.file,
            event.startLine,
            event.endLine,
          ),
        );
      });
      nodes.push(node('selector', fn.signature, 'Externally callable Solidity selector', fn.file, fn.startLine, fn.endLine));
      if (policy) {
        nodes.push(
          node(
            'policy',
            policy.recommendation,
            policy.reason,
            policy.file,
            policy.startLine,
            policy.endLine,
          ),
        );
      }

      const fallbackSeverity: Severity =
        policy?.recommendation === 'Locked' ? 'high' : policy?.recommendation === 'Restricted' ? 'medium' : 'low';
      chains.push({
        id: keccakHex(`${fn.file}|${fn.contractName}|${fn.signature}|${nodes.map((item) => item.id).join('|')}`),
        contractName: fn.contractName,
        severity: highestSeverity(relatedFindings, fallbackSeverity),
        confidence: relatedFindings.some((finding) => finding.confidence === 'high') ? 'high' : 'medium',
        title: `${fn.contractName}.${fn.functionName} exposure path`,
        explanation:
          stateVariables.length > 0 || emittedEvents.length > 0
            ? 'VeilForge observed a deterministic path from named storage or event surfaces into an externally callable function and its recommended policy boundary.'
            : 'VeilForge linked this externally callable function to matched findings and its recommended policy boundary.',
        nodes,
        findingFingerprints: [...new Set(relatedFindings.map((finding) => finding.fingerprint))],
      });
    }

    for (const variable of parsed.stateVariables) {
      if (
        variable.visibility !== 'public' ||
        !containsSensitiveTerm(`${variable.name} ${variable.typeName}`)
      ) {
        continue;
      }
      const relatedFindings = findings.filter(
        (finding) =>
          finding.file === variable.file &&
          finding.startLine >= variable.startLine &&
          finding.startLine <= variable.endLine,
      );
      const alreadyRepresented = chains.some((chain) =>
        chain.nodes.some((item) => item.kind === 'storage' && item.file === variable.file && item.startLine === variable.startLine),
      );
      if (alreadyRepresented) continue;

      const nodes = [
        node('storage', variable.name, `${variable.visibility} ${variable.typeName}`, variable.file, variable.startLine, variable.endLine),
        node('selector', `${variable.name}(…)`, 'Compiler-generated public getter', variable.file, variable.startLine, variable.endLine),
        node('policy', 'Restricted', 'Sensitive automatic getters should not remain broadly callable.', variable.file, variable.startLine, variable.endLine),
      ];
      chains.push({
        id: keccakHex(`${variable.file}|${variable.contractName}|${variable.name}|automatic-getter`),
        contractName: variable.contractName,
        severity: highestSeverity(relatedFindings, 'high'),
        confidence: 'high',
        title: `${variable.contractName}.${variable.name} automatic getter`,
        explanation: 'A public state declaration deterministically creates an externally callable getter that exposes the indexed or scalar value.',
        nodes,
        findingFingerprints: relatedFindings.map((finding) => finding.fingerprint),
      });
    }
  }

  return chains.sort(
    (a, b) =>
      severityOrder[b.severity] - severityOrder[a.severity] ||
      a.contractName.localeCompare(b.contractName) ||
      a.title.localeCompare(b.title),
  );
}

function expectedOutcome(category: FindingCategory): string {
  const outcomes: Record<FindingCategory, string> = {
    'analysis-integrity': 'Restore complete deterministic analysis for the affected source file.',
    'state-exposure': 'Remove unrestricted state observability and reduce getter-based disclosure.',
    'event-disclosure': 'Prevent sensitive runtime values from becoming permanent public log metadata.',
    'error-disclosure': 'Stop revert surfaces from revealing private workflow or account state.',
    'access-control': 'Establish an explicit least-privilege authorization boundary.',
    'trust-boundary': 'Reduce sensitive data movement across opaque or unintended contract boundaries.',
    'privileged-operation': 'Restrict administrative mutation to approved operators.',
    authorization: 'Replace ambiguous caller trust with an explicit, auditable authorization check.',
    'calldata-disclosure': 'Keep sensitive dynamic content out of plaintext transaction calldata.',
  };
  return outcomes[category];
}

export function buildTreatmentPlan(parsedFiles: ParsedFile[], findings: Finding[]): TreatmentPlanItem[] {
  return findings.map((finding, index) => {
    const contract = contractForFinding(parsedFiles, finding);
    return {
      id: keccakHex(`treatment|${finding.fingerprint}`),
      order: index + 1,
      priority: priorityFor[finding.severity],
      contractName: contract?.name ?? 'Source bundle',
      file: finding.file,
      startLine: finding.startLine,
      endLine: finding.endLine,
      title: finding.title,
      action: finding.remediation,
      expectedOutcome: expectedOutcome(finding.category),
      suggestedPolicy: finding.suggestedPolicy,
      findingFingerprint: finding.fingerprint,
      ruleId: finding.ruleId,
      severity: finding.severity,
    };
  });
}

export function generatePolicyManifest(report: ScanReport): PolicyManifest {
  return {
    schemaVersion: '1.0',
    generatedBy: `VeilForge v${report.scannerVersion}`,
    sourceHash: report.sourceHash,
    reportHash: report.reportHash,
    readinessScore: report.score,
    triageStatus: report.triage.status,
    selectors: report.policies.map((policy) => ({
      contractName: policy.contractName,
      file: policy.file,
      signature: policy.signature,
      policy: policy.recommendation.toLowerCase() as 'open' | 'restricted' | 'locked',
      confidence: policy.confidence,
      reason: policy.reason,
    })),
  };
}

export function compareReports(previous: ScanReport, current: ScanReport): ScanComparison {
  const previousFindings = new Map(previous.findings.map((finding) => [finding.fingerprint, finding]));
  const currentFindings = new Map(current.findings.map((finding) => [finding.fingerprint, finding]));
  const resolvedFindings = previous.findings.filter((finding) => !currentFindings.has(finding.fingerprint));
  const persistentFindings = current.findings.filter((finding) => previousFindings.has(finding.fingerprint));
  const introducedFindings = current.findings.filter((finding) => !previousFindings.has(finding.fingerprint));

  const policyKey = (policy: PolicyRecommendation): string =>
    `${policy.file}|${policy.contractName}|${policy.signature}`;
  const previousPolicies = new Map(previous.policies.map((policy) => [policyKey(policy), policy]));
  const policyChanges = current.policies.flatMap((policy) => {
    const before = previousPolicies.get(policyKey(policy));
    if (!before || before.recommendation === policy.recommendation) return [];
    return [{
      signature: policy.signature,
      contractName: policy.contractName,
      previous: before.recommendation,
      current: policy.recommendation,
    }];
  });

  return {
    previousReportHash: previous.reportHash,
    currentReportHash: current.reportHash,
    scoreDelta: current.score - previous.score,
    previousScore: previous.score,
    currentScore: current.score,
    resolvedFindings,
    persistentFindings,
    introducedFindings,
    policyChanges,
    statusChanged: previous.triage.status !== current.triage.status,
    previousStatus: previous.triage.status,
    currentStatus: current.triage.status,
  };
}
