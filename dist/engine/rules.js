import {
  ADMIN_TERMS,
  PRIORITY_BY_SEVERITY,
  SENSITIVE_TERMS,
} from './constants.js';
import {
  compactWhitespace,
  excerpt,
  splitIdentifier,
  stableFingerprint,
} from './canonical.js';

export const RULE_PLAYBOOK = Object.freeze({
  VF000: {
    title: 'Solidity source could not be parsed',
    category: 'analysis-integrity',
    severity: 'critical',
    impact: 'Analysis is incomplete, so deployment decisions based on this scan would be unsafe.',
    remediation: 'Fix Solidity syntax or isolate the unsupported source, then run the scan again.',
    suggestedPolicy: 'Locked',
  },
  VF001: {
    title: 'Sensitive state has an automatic public getter',
    category: 'state-exposure',
    severity: 'critical',
    impact: 'An automatic getter can expose business, identity, medical, or financial data to any observer.',
    remediation: 'Use private storage and expose a caller-scoped or role-gated read function.',
    suggestedPolicy: 'Restricted',
    saferPattern: `mapping(address => uint256) private salaryByEmployee;\n\nfunction viewMySalary() external view returns (uint256) {\n    return salaryByEmployee[msg.sender];\n}`,
  },
  VF002: {
    title: 'Event schema may disclose confidential data',
    category: 'event-disclosure',
    severity: 'high',
    impact: 'Event fields become durable public metadata and can reveal sensitive relationships or values.',
    remediation: 'Emit commitments, aggregate status, or non-sensitive references instead of raw values.',
    suggestedPolicy: 'Locked',
    saferPattern: `event PaymentCommitted(bytes32 indexed commitment);`,
  },
  VF003: {
    title: 'Revert text may leak private state',
    category: 'error-disclosure',
    severity: 'medium',
    impact: 'Detailed revert text can reveal whether an identity, account, salary, limit, or private record exists.',
    remediation: 'Use stable custom errors without secret-bearing runtime details.',
    suggestedPolicy: 'Restricted',
    saferPattern: `error MissingRecord();\nif (salary == 0) revert MissingRecord();`,
  },
  VF004: {
    title: 'Sensitive read function has no visible authorization',
    category: 'access-control',
    severity: 'high',
    impact: 'An arbitrary caller may query private financial or identity information.',
    remediation: 'Add explicit authorization or redesign the function as a caller-scoped read.',
    suggestedPolicy: 'Restricted',
  },
  VF005: {
    title: 'Sensitive state-changing entrypoint lacks a visible guard',
    category: 'access-control',
    severity: 'high',
    impact: 'An unrestricted caller may alter private records, payment state, or identity data.',
    remediation: 'Add role or caller validation and document any intentionally permissionless path.',
    suggestedPolicy: 'Restricted',
  },
  VF006: {
    title: 'Low-level call needs privacy-boundary review',
    category: 'trust-boundary',
    severity: 'medium',
    impact: 'Low-level execution hides interface guarantees and may move data or control across an unintended boundary.',
    remediation: 'Prefer typed interfaces, validate targets, and avoid secret-bearing calldata.',
    suggestedPolicy: 'Restricted',
  },
  VF007: {
    title: 'Sensitive value may cross a contract boundary',
    category: 'trust-boundary',
    severity: 'medium',
    impact: 'The destination contract may not share the same privacy guarantees or authorization model.',
    remediation: 'Classify the destination trust domain and pass commitments or minimum necessary data.',
    suggestedPolicy: 'Restricted',
  },
  VF008: {
    title: 'Public mapping exposes indexed records',
    category: 'state-exposure',
    severity: 'critical',
    impact: 'Known keys can be queried over time to reconstruct sensitive indexed records.',
    remediation: 'Use private storage and authorized lookup functions.',
    suggestedPolicy: 'Restricted',
  },
  VF009: {
    title: 'Administrative mutation has no recognizable access control',
    category: 'privileged-operation',
    severity: 'critical',
    impact: 'An arbitrary caller may change roles, configuration, operators, or critical business state.',
    remediation: 'Add least-privilege authorization and a documented revocation path.',
    suggestedPolicy: 'Restricted',
  },
  VF010: {
    title: 'tx.origin is used in an authorization-sensitive context',
    category: 'authorization',
    severity: 'critical',
    impact: 'tx.origin enables authorization confusion through intermediary contracts.',
    remediation: 'Use msg.sender with roles, signatures, or capability-based authorization.',
    suggestedPolicy: 'Locked',
  },
  VF011: {
    title: 'Event emission appears to include sensitive runtime values',
    category: 'event-disclosure',
    severity: 'high',
    impact: 'Raw runtime values in an event become permanent public metadata.',
    remediation: 'Emit a commitment, aggregate state, or non-sensitive reference.',
    suggestedPolicy: 'Locked',
  },
  VF012: {
    title: 'Sensitive dynamic payload may be recorded in calldata',
    category: 'calldata-disclosure',
    severity: 'high',
    impact: 'Plaintext string and bytes values remain visible in transaction calldata.',
    remediation: 'Send a hash, encrypted reference, or commitment and keep the original data offchain.',
    suggestedPolicy: 'Restricted',
  },
});

export function containsSensitiveTerm(value) {
  const normalized = splitIdentifier(value).join(' ');
  return SENSITIVE_TERMS.some((term) => normalized.includes(term));
}

export function matchingSensitiveTerms(value) {
  const normalized = splitIdentifier(value).join(' ');
  return SENSITIVE_TERMS.filter((term) => normalized.includes(term));
}

export function hasAccessControl(source, modifiers = []) {
  const loweredSource = String(source).toLowerCase();
  const guardedModifier = modifiers.some((modifier) =>
    /^(only|requires?|when)/i.test(modifier) ||
    /(owner|admin|role|auth|guardian|operator|manager|approver|controller)/i.test(modifier),
  );
  if (guardedModifier) return true;
  return [
    'msg.sender == owner', 'msg.sender==owner', 'msg.sender != owner', 'msg.sender!=owner',
    'hasrole(', '_checkrole(', '_authorize(', 'isauthorized(', 'authorized[msg.sender]',
  ].some((marker) => loweredSource.includes(marker));
}

function contractAtLine(parsed, line) {
  return parsed.contracts.find((contract) => line >= contract.startLine && line <= contract.endLine) ?? null;
}

function functionAtLine(parsed, line) {
  return parsed.functions.find((fn) => line >= fn.startLine && line <= fn.endLine) ?? null;
}

function makeFinding(draft) {
  const playbook = RULE_PLAYBOOK[draft.ruleId] ?? {};
  const severity = draft.severity ?? playbook.severity ?? 'medium';
  const evidence = String(draft.evidence ?? '').trim();
  const fingerprint = stableFingerprint([
    draft.ruleId,
    draft.file,
    draft.contractName ?? '',
    evidence,
  ]);
  return {
    ruleId: draft.ruleId,
    title: draft.title ?? playbook.title ?? draft.ruleId,
    description: draft.description ?? playbook.impact ?? '',
    severity,
    priority: draft.priority ?? PRIORITY_BY_SEVERITY[severity],
    file: draft.file,
    contractName: draft.contractName ?? 'Global',
    functionName: draft.functionName ?? null,
    startLine: draft.startLine,
    endLine: draft.endLine ?? draft.startLine,
    evidence,
    remediation: draft.remediation ?? playbook.remediation ?? '',
    confidence: draft.confidence ?? 'medium',
    category: draft.category ?? playbook.category ?? 'analysis-integrity',
    impact: draft.impact ?? playbook.impact ?? '',
    suggestedPolicy: draft.suggestedPolicy ?? playbook.suggestedPolicy ?? 'Restricted',
    saferPattern: draft.saferPattern ?? playbook.saferPattern ?? null,
    fingerprint,
    customRule: Boolean(draft.customRule),
  };
}

function lineFinding(parsed, lineNumber, ruleId, overrides = {}) {
  const contract = contractAtLine(parsed, lineNumber);
  const fn = functionAtLine(parsed, lineNumber);
  return makeFinding({
    ruleId,
    file: parsed.source.path,
    contractName: contract?.name ?? 'Global',
    functionName: fn?.functionName ?? null,
    startLine: lineNumber,
    endLine: lineNumber,
    ...overrides,
  });
}

function isCallable(fn) {
  return fn.contractKind !== 'interface' && (fn.visibility === 'public' || fn.visibility === 'external');
}

function sensitiveFunctionContext(fn) {
  return [fn.functionName, fn.signature, fn.parameters.join(' '), fn.returns.join(' '), fn.source].join(' ');
}

export function runBuiltInRules(parsed) {
  const findings = [];
  const lines = parsed.source.content.split('\n');

  for (const variable of parsed.stateVariables) {
    if (
      variable.contractKind !== 'interface' &&
      variable.visibility === 'public' &&
      !variable.typeName.startsWith('mapping') &&
      containsSensitiveTerm(`${variable.name} ${variable.typeName}`)
    ) {
      findings.push(makeFinding({
        ruleId: 'VF001', file: variable.file, contractName: variable.contractName,
        startLine: variable.startLine, endLine: variable.endLine, evidence: variable.source,
        confidence: matchingSensitiveTerms(`${variable.name} ${variable.typeName}`).length ? 'high' : 'medium',
      }));
    }
  }

  for (const event of parsed.events) {
    if (!containsSensitiveTerm(`${event.name} ${event.parameters.join(' ')}`)) continue;
    findings.push(makeFinding({
      ruleId: 'VF002', file: event.file, contractName: event.contractName,
      startLine: event.startLine, endLine: event.endLine, evidence: event.source, confidence: 'high',
    }));
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (/(?:require\s*\([^;]*,[^;]*["']|revert\s*\(\s*["'])/.test(line) && containsSensitiveTerm(line)) {
      findings.push(lineFinding(parsed, lineNumber, 'VF003', { evidence: line.trim(), confidence: 'high' }));
    }

    if (/\.(?:delegatecall|callcode|call|staticcall)\s*(?:\{|\()/.test(line)) {
      const dangerous = /\.(?:delegatecall|callcode)/.test(line);
      findings.push(lineFinding(parsed, lineNumber, 'VF006', {
        evidence: line.trim(),
        severity: dangerous ? 'critical' : 'medium',
        priority: dangerous ? 'P0' : 'P2',
        suggestedPolicy: dangerous ? 'Locked' : 'Restricted',
        title: dangerous ? 'Delegate-style call crosses trust boundaries' : undefined,
        confidence: 'high',
      }));
    }

    if (/\.[A-Za-z_$][A-Za-z0-9_$]*\s*\([^;]*\)/.test(line) && containsSensitiveTerm(line) && !/\b(?:emit|require|assert|revert)\b/.test(line)) {
      findings.push(lineFinding(parsed, lineNumber, 'VF007', { evidence: line.trim(), confidence: 'medium' }));
    }

    if (/\btx\.origin\b/.test(line)) {
      findings.push(lineFinding(parsed, lineNumber, 'VF010', { evidence: line.trim(), confidence: 'high' }));
    }

    if (/\bemit\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\(/.test(line) && containsSensitiveTerm(line)) {
      findings.push(lineFinding(parsed, lineNumber, 'VF011', { evidence: line.trim(), confidence: 'medium' }));
    }
  });

  for (const fn of parsed.functions) {
    if (!isCallable(fn)) continue;
    const context = sensitiveFunctionContext(fn);
    const isRead = fn.stateMutability === 'view' || fn.stateMutability === 'pure';
    const callerScoped = /\bmsg\.sender\b/.test(fn.source) && !fn.parameters.some((parameter) => /\baddress\b/.test(parameter));

    if (isRead && containsSensitiveTerm(context) && !hasAccessControl(fn.source, fn.modifiers) && !callerScoped) {
      findings.push(makeFinding({
        ruleId: 'VF004', file: fn.file, contractName: fn.contractName, functionName: fn.functionName,
        startLine: fn.startLine, endLine: fn.endLine,
        evidence: excerpt(parsed.source.content, fn.startLine, Math.min(fn.startLine + 2, fn.endLine)), confidence: 'high',
      }));
    }

    if (!isRead && containsSensitiveTerm(context) && !hasAccessControl(fn.source, fn.modifiers)) {
      const permissionless = /\b(deposit|pay|submit|register|claim|transfer)\b/i.test(fn.functionName);
      findings.push(makeFinding({
        ruleId: 'VF005', file: fn.file, contractName: fn.contractName, functionName: fn.functionName,
        startLine: fn.startLine, endLine: fn.endLine,
        evidence: excerpt(parsed.source.content, fn.startLine, Math.min(fn.startLine + 3, fn.endLine)),
        severity: permissionless ? 'medium' : 'high',
        priority: permissionless ? 'P2' : 'P1',
        confidence: permissionless ? 'medium' : 'high',
      }));
    }

    const dynamicPayload = fn.parameters.some((parameter) => /\b(?:string|bytes)(?:\s|\[|$)/.test(parameter));
    if (dynamicPayload && containsSensitiveTerm(context)) {
      findings.push(makeFinding({
        ruleId: 'VF012', file: fn.file, contractName: fn.contractName, functionName: fn.functionName,
        startLine: fn.startLine, endLine: fn.endLine,
        evidence: excerpt(parsed.source.content, fn.startLine), confidence: 'medium',
      }));
    }
  }

  for (const variable of parsed.stateVariables) {
    if (variable.contractKind === 'interface' || variable.visibility !== 'public' || !variable.typeName.startsWith('mapping')) continue;
    findings.push(makeFinding({
      ruleId: 'VF008', file: variable.file, contractName: variable.contractName,
      startLine: variable.startLine, endLine: variable.endLine, evidence: variable.source,
      severity: containsSensitiveTerm(`${variable.name} ${variable.typeName}`) ? 'critical' : 'high',
      confidence: 'high',
    }));
  }

  for (const fn of parsed.functions) {
    if (!isCallable(fn) || hasAccessControl(fn.source, fn.modifiers)) continue;
    const name = fn.functionName.toLowerCase();
    const adminMutation = ADMIN_TERMS.some((term) => name.includes(term)) || /^(set|update|grant|revoke|configure)/.test(name);
    if (!adminMutation || fn.stateMutability === 'view' || fn.stateMutability === 'pure') continue;
    findings.push(makeFinding({
      ruleId: 'VF009', file: fn.file, contractName: fn.contractName, functionName: fn.functionName,
      startLine: fn.startLine, endLine: fn.endLine,
      evidence: excerpt(parsed.source.content, fn.startLine, Math.min(fn.startLine + 2, fn.endLine)), confidence: 'medium',
    }));
  }

  const unique = new Map();
  for (const finding of findings) unique.set(finding.fingerprint, finding);
  const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...unique.values()].sort((a, b) =>
    severityRank[a.severity] - severityRank[b.severity] ||
    a.file.localeCompare(b.file) ||
    a.startLine - b.startLine ||
    a.ruleId.localeCompare(b.ruleId));
}

export function runCustomRules(parsedFiles, customRules = []) {
  const output = [];
  for (const rule of customRules) {
    if (!rule || typeof rule.detect !== 'function' || !rule.id) continue;
    const drafts = rule.detect({
      parsedFiles,
      helpers: Object.freeze({ containsSensitiveTerm, matchingSensitiveTerms, hasAccessControl, compactWhitespace }),
    }) ?? [];
    for (const draft of drafts) {
      output.push(makeFinding({
        ...draft,
        ruleId: rule.id,
        title: draft.title ?? rule.title ?? rule.id,
        description: draft.description ?? rule.description ?? '',
        severity: draft.severity ?? rule.severity ?? 'medium',
        category: draft.category ?? rule.category ?? 'custom-rule',
        impact: draft.impact ?? rule.impact ?? '',
        remediation: draft.remediation ?? rule.remediation ?? '',
        suggestedPolicy: draft.suggestedPolicy ?? rule.suggestedPolicy ?? 'Restricted',
        confidence: draft.confidence ?? rule.confidence ?? 'medium',
        saferPattern: draft.saferPattern ?? rule.saferPattern ?? null,
        customRule: true,
      }));
    }
  }
  return output;
}

export function parseFailureFinding(file, error) {
  return makeFinding({
    ruleId: 'VF000',
    file: file.path,
    contractName: 'Unparsed',
    startLine: 1,
    endLine: 1,
    evidence: error instanceof Error ? error.message : String(error),
    confidence: 'high',
  });
}
