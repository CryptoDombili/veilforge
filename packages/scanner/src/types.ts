export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Confidence = 'high' | 'medium' | 'low';
export type AccessPolicy = 'Open' | 'Restricted' | 'Locked';
export type TriageStatus = 'ready' | 'review-required' | 'high-risk' | 'deployment-blocked';
export type TreatmentPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type FindingCategory =
  | 'analysis-integrity'
  | 'state-exposure'
  | 'event-disclosure'
  | 'error-disclosure'
  | 'access-control'
  | 'trust-boundary'
  | 'privileged-operation'
  | 'authorization'
  | 'calldata-disclosure';

export interface SourceFile {
  path: string;
  content: string;
}

export interface CustomRuleContext {
  file: SourceFile;
  line: string;
  lineNumber: number;
  source: string;
}

export interface CustomDetectionRule {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  category: FindingCategory;
  confidence: Confidence;
  impact: string;
  remediation: string;
  suggestedPolicy: AccessPolicy;
  saferPattern?: string;
  matches: (context: CustomRuleContext) => boolean;
}

export interface ScanOptions {
  customRules?: CustomDetectionRule[];
}

export interface SourceLocation {
  file: string;
  startLine: number;
  endLine: number;
  startColumn?: number;
  endColumn?: number;
}

export interface Finding extends SourceLocation {
  ruleId: string;
  title: string;
  description: string;
  severity: Severity;
  evidence: string;
  remediation: string;
  confidence: Confidence;
  fingerprint: string;
  category: FindingCategory;
  impact: string;
  suggestedPolicy: AccessPolicy;
  saferPattern?: string;
}

export interface PolicyRecommendation extends SourceLocation {
  contractName: string;
  functionName: string;
  signature: string;
  currentVisibility: string;
  recommendation: AccessPolicy;
  reason: string;
  confidence: Confidence;
}

export interface SeverityTotals {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface ExposureSurface {
  publicStateVariables: number;
  publicMappings: number;
  externallyCallableFunctions: number;
  sensitiveSelectors: number;
  sensitiveEvents: number;
  crossContractFindings: number;
  restrictedSelectors: number;
  lockedSelectors: number;
}

export interface ContractSummary {
  id: string;
  file: string;
  contractName: string;
  startLine: number;
  endLine: number;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  status: TriageStatus;
  summary: SeverityTotals;
  findingCount: number;
  externallyCallableFunctions: number;
  sensitiveSelectors: number;
  topFindingFingerprints: string[];
}

export type ExposureNodeKind = 'storage' | 'function' | 'event' | 'selector' | 'policy';

export interface ExposureNode extends SourceLocation {
  id: string;
  kind: ExposureNodeKind;
  label: string;
  detail: string;
}

export interface ExposureChain {
  id: string;
  contractName: string;
  severity: Severity;
  confidence: Confidence;
  title: string;
  explanation: string;
  nodes: ExposureNode[];
  findingFingerprints: string[];
}

export interface TreatmentPlanItem extends SourceLocation {
  id: string;
  order: number;
  priority: TreatmentPriority;
  contractName: string;
  title: string;
  action: string;
  expectedOutcome: string;
  suggestedPolicy: AccessPolicy;
  findingFingerprint: string;
  ruleId: string;
  severity: Severity;
}

export interface ProjectTriage {
  status: TriageStatus;
  deploymentAllowed: boolean;
  blockerFingerprints: string[];
  contractsAtRisk: number;
  topRiskCategories: Array<{ category: FindingCategory; count: number }>;
  explanation: string;
}

export interface PolicyManifestSelector {
  contractName: string;
  file: string;
  signature: string;
  policy: 'open' | 'restricted' | 'locked';
  confidence: Confidence;
  reason: string;
}

export interface PolicyManifest {
  schemaVersion: '1.0';
  generatedBy: string;
  sourceHash: `0x${string}`;
  reportHash: `0x${string}`;
  readinessScore: number;
  triageStatus: TriageStatus;
  selectors: PolicyManifestSelector[];
}

export interface ScanComparison {
  previousReportHash: `0x${string}`;
  currentReportHash: `0x${string}`;
  scoreDelta: number;
  previousScore: number;
  currentScore: number;
  resolvedFindings: Finding[];
  persistentFindings: Finding[];
  introducedFindings: Finding[];
  policyChanges: Array<{
    signature: string;
    contractName: string;
    previous: AccessPolicy;
    current: AccessPolicy;
  }>;
  statusChanged: boolean;
  previousStatus: TriageStatus;
  currentStatus: TriageStatus;
}

export interface AnalysisProfile {
  engine: 'veilforge-deterministic';
  execution: 'local';
  aiApiUsed: false;
  hashAlgorithm: 'keccak256';
  builtInRuleIds: string[];
  customRuleIds: string[];
}

export interface ScanReport {
  schemaVersion: '1.8';
  scannerVersion: string;
  analysisProfile: AnalysisProfile;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  summary: SeverityTotals;
  exposure: ExposureSurface;
  findings: Finding[];
  policies: PolicyRecommendation[];
  contracts: ContractSummary[];
  triage: ProjectTriage;
  exposureChains: ExposureChain[];
  treatmentPlan: TreatmentPlanItem[];
  files: Array<{ path: string; lines: number }>;
  sourceHash: `0x${string}`;
  reportHash: `0x${string}`;
  disclaimer: string;
}

export interface ParsedFunction {
  file: string;
  contractName: string;
  functionName: string;
  signature: string;
  visibility: string;
  stateMutability: string;
  modifiers: string[];
  parameters: string[];
  returns: string[];
  startLine: number;
  endLine: number;
  source: string;
}

export interface ParsedStateVariable {
  file: string;
  contractName: string;
  name: string;
  visibility: string;
  typeName: string;
  startLine: number;
  endLine: number;
  source: string;
}

export interface ParsedEvent {
  file: string;
  contractName: string;
  name: string;
  parameters: string[];
  startLine: number;
  endLine: number;
  source: string;
}

export interface ParsedContract {
  file: string;
  name: string;
  startLine: number;
  endLine: number;
}

export interface ParsedFile {
  source: SourceFile;
  contracts: ParsedContract[];
  functions: ParsedFunction[];
  stateVariables: ParsedStateVariable[];
  events: ParsedEvent[];
}
