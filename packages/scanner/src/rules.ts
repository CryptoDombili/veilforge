import {
  ADMIN_TERMS,
} from './constants.js';
import type {
  Finding,
  ParsedFile,
  ParsedFunction,
  Severity,
} from './types.js';
import {
  compactWhitespace,
  containsSensitiveTerm,
  excerpt,
  hasAccessControl,
  keccakHex,
  matchingSensitiveTerms,
  normalizeText,
} from './utils.js';

interface FindingDraft {
  ruleId: string;
  title: string;
  description: string;
  severity: Severity;
  file: string;
  startLine: number;
  endLine: number;
  evidence: string;
  remediation: string;
  confidence: 'high' | 'medium' | 'low';
}

function finding(draft: FindingDraft): Finding {
  const fingerprint = keccakHex(
    [draft.ruleId, draft.file, draft.startLine, compactWhitespace(draft.evidence)].join('|'),
  );
  return { ...draft, fingerprint };
}

function linesOf(parsed: ParsedFile): string[] {
  return normalizeText(parsed.source.content).split('\n');
}

function isPubliclyCallable(fn: ParsedFunction): boolean {
  return fn.visibility === 'public' || fn.visibility === 'external';
}

function sensitiveContext(fn: ParsedFunction): string {
  return [fn.functionName, fn.signature, fn.parameters.join(' '), fn.returns.join(' '), fn.source].join(' ');
}

function lineFindings(
  parsed: ParsedFile,
  pattern: RegExp,
  build: (line: string, lineNumber: number) => Finding | null,
): Finding[] {
  const findings: Finding[] = [];
  linesOf(parsed).forEach((line, index) => {
    pattern.lastIndex = 0;
    if (!pattern.test(line)) return;
    const result = build(line, index + 1);
    if (result) findings.push(result);
  });
  return findings;
}

export function runRules(parsed: ParsedFile): Finding[] {
  const findings: Finding[] = [];

  // VF001 — sensitive public state, except mappings (covered by VF008).
  for (const variable of parsed.stateVariables) {
    if (
      variable.visibility === 'public' &&
      !variable.typeName.startsWith('mapping(') &&
      containsSensitiveTerm(`${variable.name} ${variable.typeName}`)
    ) {
      const terms = matchingSensitiveTerms(`${variable.name} ${variable.typeName}`);
      findings.push(
        finding({
          ruleId: 'VF001',
          title: 'Sensitive state has an automatic public getter',
          description:
            'A public state variable creates an externally readable getter. On a public EVM this can expose business, identity, or financial data that an APS migration may intend to restrict.',
          severity: 'critical',
          file: variable.file,
          startLine: variable.startLine,
          endLine: variable.endLine,
          evidence: variable.source,
          remediation:
            'Make the state non-public and expose an explicitly authorized read function. In an APS deployment, consider a Restricted policy for that function.',
          confidence: terms.length > 0 ? 'high' : 'medium',
        }),
      );
    }
  }

  // VF002 — sensitive event declaration.
  for (const event of parsed.events) {
    const context = `${event.name} ${event.parameters.join(' ')}`;
    if (!containsSensitiveTerm(context)) continue;
    findings.push(
      finding({
        ruleId: 'VF002',
        title: 'Event schema may disclose confidential data',
        description:
          'Events are public and permanent on standard EVM chains. Arc APS disables event logging by default, so event schemas carrying sensitive values need an explicit privacy decision.',
        severity: 'high',
        file: event.file,
        startLine: event.startLine,
        endLine: event.endLine,
        evidence: event.source,
        remediation:
          'Emit only non-sensitive commitments or aggregate status. Keep confidential values out of public logs and document any future APS event exposure explicitly.',
        confidence: 'high',
      }),
    );
  }

  // VF003 — verbose revert strings that reveal sensitive state or identity.
  findings.push(
    ...lineFindings(
      parsed,
      /(?:require\s*\([^;]*,[^;]*["']|revert\s*\(\s*["'])/,
      (line, lineNumber) => {
        if (!containsSensitiveTerm(line)) return null;
        return finding({
          ruleId: 'VF003',
          title: 'Revert text may leak private state',
          description:
            'Detailed revert messages can reveal account status, limits, identity or financial conditions. APS sanitizes revert reasons across privacy boundaries, but migration-ready code should not depend on secret-bearing messages.',
          severity: 'medium',
          file: parsed.source.path,
          startLine: lineNumber,
          endLine: lineNumber,
          evidence: line.trim(),
          remediation:
            'Use stable error codes or custom errors that do not encode private values or state-specific facts.',
          confidence: 'medium',
        });
      },
    ),
  );

  // VF004 — unguarded sensitive view/read function.
  for (const fn of parsed.functions) {
    if (!isPubliclyCallable(fn)) continue;
    const isRead = fn.stateMutability === 'view' || fn.stateMutability === 'pure';
    const callerScoped = /msg\.sender/.test(fn.source) && /(my|self)/i.test(fn.functionName);
    if (
      !isRead ||
      !containsSensitiveTerm(sensitiveContext(fn)) ||
      hasAccessControl(fn.source, fn.modifiers) ||
      callerScoped
    ) {
      continue;
    }
    findings.push(
      finding({
        ruleId: 'VF004',
        title: 'Sensitive read function has no visible authorization',
        description:
          'The function is publicly callable and appears to return or derive sensitive information without a recognizable authorization guard.',
        severity: 'high',
        file: fn.file,
        startLine: fn.startLine,
        endLine: fn.endLine,
        evidence: excerpt(parsed.source.content, fn.startLine, Math.min(fn.startLine + 2, fn.endLine)),
        remediation:
          'Add explicit authorization and recommend a Restricted APS policy. Prefer caller-scoped reads such as viewMySalary() over arbitrary-address getters.',
        confidence: 'high',
      }),
    );
  }

  // VF005 — unguarded public write touching sensitive context.
  for (const fn of parsed.functions) {
    if (!isPubliclyCallable(fn)) continue;
    const isWrite = fn.stateMutability !== 'view' && fn.stateMutability !== 'pure';
    if (!isWrite || !containsSensitiveTerm(sensitiveContext(fn)) || hasAccessControl(fn.source, fn.modifiers)) {
      continue;
    }
    const looksIntentionallyPermissionless = /\b(deposit|pay|submit|register|claim|transfer)\b/i.test(
      fn.functionName,
    );
    findings.push(
      finding({
        ruleId: 'VF005',
        title: 'Sensitive state-changing entrypoint lacks a visible guard',
        description:
          'A public or external function appears to change sensitive financial or identity-related state without a recognizable authorization boundary.',
        severity: looksIntentionallyPermissionless ? 'medium' : 'high',
        file: fn.file,
        startLine: fn.startLine,
        endLine: fn.endLine,
        evidence: excerpt(parsed.source.content, fn.startLine, Math.min(fn.startLine + 3, fn.endLine)),
        remediation:
          'Document why the function is permissionless or add role/caller validation. Recommend Restricted when only approved actors should invoke it.',
        confidence: looksIntentionallyPermissionless ? 'medium' : 'high',
      }),
    );
  }

  // VF006 — low-level call surface.
  findings.push(
    ...lineFindings(
      parsed,
      /\.(?:delegatecall|callcode|call|staticcall)\s*(?:\{|\()/,
      (line, lineNumber) => {
        const lowered = line.toLowerCase();
        const dangerous = lowered.includes('.delegatecall') || lowered.includes('.callcode');
        return finding({
          ruleId: 'VF006',
          title: dangerous ? 'Delegate-style call crosses trust boundaries' : 'Low-level call needs privacy-boundary review',
          description: dangerous
            ? 'Delegatecall executes foreign code in the caller storage context and can invalidate isolation assumptions.'
            : 'Low-level calls obscure the target interface and can carry confidential values across public/private or trusted/untrusted boundaries.',
          severity: dangerous ? 'critical' : 'medium',
          file: parsed.source.path,
          startLine: lineNumber,
          endLine: lineNumber,
          evidence: line.trim(),
          remediation: dangerous
            ? 'Avoid delegatecall in privacy-sensitive paths or constrain the target to immutable, audited code with explicit trust assumptions.'
            : 'Use typed interfaces, validate target contracts, document trust domains and avoid passing secret-bearing calldata to public contracts.',
          confidence: 'high',
        });
      },
    ),
  );

  // VF007 — likely sensitive value sent through an external call.
  findings.push(
    ...lineFindings(parsed, /\.[A-Za-z_][A-Za-z0-9_]*\s*\([^;]*\)/, (line, lineNumber) => {
      if (!containsSensitiveTerm(line)) return null;
      if (/\b(?:emit|require|assert|revert)\b/.test(line)) return null;
      return finding({
        ruleId: 'VF007',
        title: 'Sensitive value may cross a contract boundary',
        description:
          'The call expression appears to pass a value with a sensitive semantic name to another contract. The destination may not share the same APS trust domain.',
        severity: 'medium',
        file: parsed.source.path,
        startLine: lineNumber,
        endLine: lineNumber,
        evidence: line.trim(),
        remediation:
          'Classify the destination as public or private, define a one-way trust relationship where appropriate, and pass commitments or minimum necessary data.',
        confidence: 'medium',
      });
    }),
  );

  // VF008 — any public mapping.
  for (const variable of parsed.stateVariables) {
    if (variable.visibility !== 'public' || !variable.typeName.startsWith('mapping(')) continue;
    findings.push(
      finding({
        ruleId: 'VF008',
        title: 'Public mapping exposes indexed records',
        description:
          'A public mapping creates an automatic getter. Even when keys are unknown, counterparties, indexers and application flows can reveal them over time.',
        severity: containsSensitiveTerm(`${variable.name} ${variable.typeName}`) ? 'critical' : 'high',
        file: variable.file,
        startLine: variable.startLine,
        endLine: variable.endLine,
        evidence: variable.source,
        remediation:
          'Use internal/private storage and an authorized read function. Recommend Restricted for record lookup functions that disclose private state.',
        confidence: 'high',
      }),
    );
  }

  // VF009 — unrestricted admin-like mutation.
  for (const fn of parsed.functions) {
    if (!isPubliclyCallable(fn) || hasAccessControl(fn.source, fn.modifiers)) continue;
    const name = fn.functionName.toLowerCase();
    const isAdminMutation = ADMIN_TERMS.some((term) => name.includes(term)) || /^(set|update|grant|revoke)/.test(name);
    if (!isAdminMutation || fn.stateMutability === 'view' || fn.stateMutability === 'pure') continue;
    findings.push(
      finding({
        ruleId: 'VF009',
        title: 'Administrative mutation has no recognizable access control',
        description:
          'The function name suggests privileged configuration or role changes, but no common access-control marker was detected.',
        severity: 'critical',
        file: fn.file,
        startLine: fn.startLine,
        endLine: fn.endLine,
        evidence: excerpt(parsed.source.content, fn.startLine, Math.min(fn.startLine + 2, fn.endLine)),
        remediation:
          'Add explicit authorization, least-privilege roles and revocation paths. Recommend Restricted; use Locked for deprecated or emergency-disabled selectors.',
        confidence: 'medium',
      }),
    );
  }

  // VF010 — transaction-origin authorization.
  findings.push(
    ...lineFindings(parsed, /\btx\.origin\b/, (line, lineNumber) =>
      finding({
        ruleId: 'VF010',
        title: 'tx.origin is used in an authorization-sensitive context',
        description:
          'tx.origin enables phishing-style authorization confusion and is especially unsafe when privacy or trust-domain boundaries are involved.',
        severity: 'critical',
        file: parsed.source.path,
        startLine: lineNumber,
        endLine: lineNumber,
        evidence: line.trim(),
        remediation: 'Use msg.sender with explicit roles, signatures or capability-based authorization.',
        confidence: 'high',
      }),
    ),
  );

  // VF011 — emitted sensitive runtime values.
  findings.push(
    ...lineFindings(parsed, /\bemit\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/, (line, lineNumber) => {
      if (!containsSensitiveTerm(line)) return null;
      return finding({
        ruleId: 'VF011',
        title: 'Event emission appears to include sensitive runtime values',
        description:
          'This emit statement includes identifiers associated with confidential financial, identity or account data.',
        severity: 'high',
        file: parsed.source.path,
        startLine: lineNumber,
        endLine: lineNumber,
        evidence: line.trim(),
        remediation:
          'Replace raw values with a commitment, aggregate status or a non-sensitive reference. Treat APS event exposure as an explicit opt-in decision.',
        confidence: 'medium',
      });
    }),
  );

  // VF012 — sensitive dynamic strings/bytes in public APIs.
  for (const fn of parsed.functions) {
    if (!isPubliclyCallable(fn)) continue;
    const hasDynamicPayload = fn.parameters.some((parameter) => /\b(?:string|bytes)\b/.test(parameter));
    if (!hasDynamicPayload || !containsSensitiveTerm(sensitiveContext(fn))) continue;
    findings.push(
      finding({
        ruleId: 'VF012',
        title: 'Sensitive dynamic payload may be recorded in calldata',
        description:
          'String and bytes parameters are permanently visible in public transaction calldata. Names such as memo, invoice, identity or KYC suggest an accidental data-retention risk.',
        severity: 'high',
        file: fn.file,
        startLine: fn.startLine,
        endLine: fn.endLine,
        evidence: excerpt(parsed.source.content, fn.startLine, fn.startLine),
        remediation:
          'Send a content hash or encrypted reference instead of plaintext. Keep the original document offchain with a documented access policy.',
        confidence: 'medium',
      }),
    );
  }

  // De-duplicate and order deterministically.
  const unique = new Map<string, Finding>();
  for (const item of findings) unique.set(item.fingerprint, item);

  const severityRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...unique.values()].sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] ||
      a.file.localeCompare(b.file) ||
      a.startLine - b.startLine ||
      a.ruleId.localeCompare(b.ruleId),
  );
}
