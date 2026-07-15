export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Confidence = 'high' | 'medium' | 'low';
export type AccessPolicy = 'Open' | 'Restricted' | 'Locked';

export interface SourceFile {
  path: string;
  content: string;
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

export interface ScanReport {
  schemaVersion: '1.0';
  scannerVersion: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  summary: SeverityTotals;
  findings: Finding[];
  policies: PolicyRecommendation[];
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
