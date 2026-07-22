import type { CustomDetectionRule, Finding, SourceFile } from './types.js';
import { compactWhitespace, keccakHex, normalizeText } from './utils.js';

function validateRule(rule: CustomDetectionRule): void {
  if (!/^VF_[A-Z0-9_]{3,64}$/.test(rule.id)) {
    throw new Error(`Custom rule id "${rule.id}" must match VF_[A-Z0-9_]{3,64}.`);
  }
  if (!rule.title.trim() || !rule.description.trim() || !rule.remediation.trim()) {
    throw new Error(`Custom rule ${rule.id} is missing required human-readable metadata.`);
  }
}

export function runCustomRules(files: SourceFile[], rules: CustomDetectionRule[]): Finding[] {
  const seenIds = new Set<string>();
  rules.forEach((rule) => {
    validateRule(rule);
    if (seenIds.has(rule.id)) throw new Error(`Duplicate custom rule id: ${rule.id}`);
    seenIds.add(rule.id);
  });

  const findings: Finding[] = [];
  for (const file of files) {
    const source = normalizeText(file.content);
    const lines = source.split('\n');
    for (const rule of rules) {
      lines.forEach((line, index) => {
        const lineNumber = index + 1;
        if (!rule.matches({ file, line, lineNumber, source })) return;
        const evidence = line.trim() || '(blank line match)';
        findings.push({
          ruleId: rule.id,
          title: rule.title,
          description: rule.description,
          severity: rule.severity,
          file: file.path,
          startLine: lineNumber,
          endLine: lineNumber,
          evidence,
          remediation: rule.remediation,
          confidence: rule.confidence,
          category: rule.category,
          impact: rule.impact,
          suggestedPolicy: rule.suggestedPolicy,
          ...(rule.saferPattern === undefined ? {} : { saferPattern: rule.saferPattern }),
          fingerprint: keccakHex(
            [rule.id, file.path, lineNumber, compactWhitespace(evidence)].join('|'),
          ),
        });
      });
    }
  }
  return findings;
}
