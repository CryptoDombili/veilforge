# Canonical report schema

The v1.8 report uses `schemaVersion: "1.8"`.

Top-level sections:

- `scannerVersion`
- immutable `analysisProfile` metadata (local execution, no AI API, Keccak-256 and rule IDs)
- `score` and `grade`
- severity `summary`
- project `exposure` metrics
- `findings`
- selector `policies`
- contract-level `contracts`
- project `triage`
- deterministic `exposureChains`
- ordered `treatmentPlan`
- source `files`
- `sourceHash`
- `reportHash`
- legal `disclaimer`

The JSON Schema is in `schemas/report.schema.json`.

## Fingerprints

Finding fingerprints are Keccak-256 hashes of rule ID, file, source line and normalized evidence. They support stable comparison when the finding location and evidence remain unchanged.

## Comparison behavior

`compareReports` classifies finding fingerprints as resolved, persistent or introduced. Policy changes are compared using file, contract and function signature.

## Analysis profile

Every report records the built-in and custom rule IDs that were executed. This prevents a report from hiding which deterministic rule profile produced it, including when a custom rule produces zero findings.
