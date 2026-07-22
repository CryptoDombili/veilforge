# Contributing to VeilForge

VeilForge accepts contributions that strengthen deterministic, local and explainable privacy-readiness analysis.

## Product invariants

Every contribution must preserve these rules:

1. Solidity source is not sent to an AI API or external analysis service.
2. Identical normalized input and scanner version produce identical output.
3. Findings include a rule ID, exact location, evidence, impact and remediation.
4. New rules avoid pretending certainty; confidence must be explicit.
5. On-chain integrations store hashes and metadata, never source code.
6. Web, CLI and exports use the canonical `packages/scanner` engine.

## Development

```bash
npm install
npm run check
npm run dev
```

## Adding a built-in rule

1. Add detection logic to `packages/scanner/src/rules.ts`.
2. Add impact, policy and safer-pattern metadata to `packages/scanner/src/playbook.ts`.
3. Add positive and negative fixtures to `packages/scanner/test/scanner.test.ts`.
4. Document the rule in `docs/detection-rules.md`.
5. Confirm canonical report hashing remains stable for identical input.

## Adding a project-specific rule

Use the public `CustomDetectionRule` interface instead of editing the built-in rule set. See `examples/custom-detection-rule`.

## Pull requests

A useful pull request should include:

- the problem and privacy impact
- why the implementation is deterministic
- false-positive and false-negative boundaries
- tests
- documentation updates
- screenshots for visual changes

Avoid unrelated formatting changes in the same pull request.

## Security reports

Do not publish private source code or credentials in an issue. Provide a minimal reproducible fixture that does not contain production secrets.
