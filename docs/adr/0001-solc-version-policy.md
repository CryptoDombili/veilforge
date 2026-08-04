# ADR-0001: Exact solc 0.8.24

- Status: Accepted
- Applies to: VeilForge v4.0.0-gc.1

## Decision

The Grant Candidate supports only exact Solidity compiler version `0.8.24`. The full compiler build and Standard JSON settings are provenance inputs.

No pragma range, installed compiler, artifact metadata, or newer compatible-looking compiler may silently select another version. A requested or discovered version other than exact `0.8.24` produces analysis status `unsupported-compiler` and cannot pass a deployment gate.

Compiler process success is insufficient: JSON diagnostics containing severity `error` produce `compile-error`.

## Consequences

The first release has a deliberately narrow compatibility surface. Additional compiler versions require their own corpus run, golden source-location validation, determinism evidence, and an accepted ADR.
