# Detection Rules and Custom Rules

## Built-in rule contract

Every finding contains:

- stable rule ID
- title and description
- severity and P0–P3 priority
- category and confidence
- exact file and line range
- contract and optional function association
- source evidence
- impact
- remediation
- suggested policy
- optional safer pattern
- deterministic fingerprint

## Built-in rules

### VF001 — sensitive public state

Detects non-mapping public state declarations with sensitive semantic names. Default: Critical / P0 / Restricted.

### VF002 — sensitive event schema

Detects events whose name or parameters include sensitive semantics. Default: High / P1 / Locked.

### VF003 — secret-bearing revert text

Detects sensitive text in `require` or string-style `revert`. Default: Medium / P2 / Restricted.

### VF004 — unguarded sensitive read

Detects publicly callable read functions with sensitive semantics and no recognized authorization or caller-scoped pattern. Default: High / P1 / Restricted.

### VF005 — unguarded sensitive write

Detects publicly callable state-changing functions with sensitive semantics and no recognized authorization. Permissionless-looking names receive Medium instead of High.

### VF006 — low-level call

Detects `call`, `staticcall`, `delegatecall`, and `callcode`. Delegate-style calls escalate to Critical / P0 / Locked.

### VF007 — cross-contract sensitive value

Detects likely sensitive values passed through call expressions. Default: Medium / P2 / Restricted.

### VF008 — public mapping

Detects automatic mapping getters. Sensitive mappings are Critical; other public mappings are High.

### VF009 — unguarded administrative mutation

Detects public administrative-looking state changes without recognizable access control. Default: Critical / P0 / Restricted.

### VF010 — tx.origin authorization

Detects `tx.origin`. Default: Critical / P0 / Locked.

### VF011 — sensitive emit values

Detects event emissions with sensitive runtime semantics. Default: High / P1 / Locked.

### VF012 — dynamic sensitive calldata

Detects sensitive public APIs with `string` or `bytes` parameters. Default: High / P1 / Restricted.

## Authorization markers

The deterministic guard recognizer checks:

- modifiers beginning with `only`, `require`, or `when`
- modifier names containing owner, admin, role, auth, guardian, operator, manager, approver, or controller
- common inline `msg.sender`, role, and authorization checks

It cannot prove that a guard is correct. It only recognizes an explicit boundary.

## Custom rule interface

```js
const rule = {
  id: 'ORG001',
  title: 'Organization rule title',
  severity: 'medium',
  category: 'custom-rule',
  impact: 'Default impact.',
  remediation: 'Default remediation.',
  suggestedPolicy: 'Restricted',
  detect({ parsedFiles, helpers }) {
    return [
      {
        file: 'Contract.sol',
        contractName: 'Contract',
        startLine: 10,
        endLine: 10,
        evidence: 'source evidence',
        confidence: 'high',
      },
    ];
  },
};
```

`helpers` exposes deterministic sensitive-term and authorization functions. A custom rule must not call a network service, read time, use randomness, or mutate the parsed project.
