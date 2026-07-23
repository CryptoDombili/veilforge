# Contributing to VeilForge

VeilForge accepts focused contributions that preserve its local-first and deterministic trust model.

## Ground rules

- Never add an AI API call that receives Solidity source or report evidence.
- The same normalized source bundle must produce the same canonical report.
- Web, CLI, exports, and proof payloads must use the canonical analyzer engine.
- New rules must include deterministic fixtures and remediation guidance.
- Do not commit private keys, seed phrases, `.env` files, `node_modules`, or wallet exports.
- Keep pull requests narrow and explain the privacy-engineering reason for the change.

## Development

```bash
npm install
npm run preflight
```

## Adding a built-in rule

1. Add playbook metadata in `packages/analyzer/src/rules.js`.
2. Implement deterministic detection without network access or timestamps.
3. Return exact file and line evidence.
4. Define severity, confidence, impact, remediation, suggested policy, and safer pattern where useful.
5. Add a fixture and a test proving both detection and non-detection.
6. Update `docs/detection-rules.md` and the report schema when the output shape changes.

## Pull request checklist

- [ ] `npm run preflight` passes
- [ ] no source code leaves the local runtime
- [ ] output is deterministic
- [ ] report and policy schema compatibility considered
- [ ] browser and CLI use the same engine
- [ ] no secrets or generated `dist/` files committed
