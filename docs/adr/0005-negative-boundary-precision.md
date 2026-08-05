# ADR 0005: Negative Boundary Precision

Status: accepted for v4.0.0-gc.1.

## Context

After Phase 4C-1, the benchmark retained 25 negative-case false positives. They were concentrated in four model mismatches: declaration/use trace duplication, raw-versus-derived return confusion, ABI encoding classified as metadata and as a dynamic external boundary outside metadata context, and fully qualified public-field policy identities not matching their declarations.

## Decision

All non-calldata detector results pass through one semantic-boundary selector before result construction.

- A semantic boundary is keyed by detector, source symbol, exact sink candidate, source/sink callable, data class, and policy disposition.
- Equivalent declaration/use traces merge; distinct sinks and argument positions remain independent.
- Predicate returns are not raw disclosures.
- `abi.encode*` is metadata only in metadata/URI/memo callable context.
- A dynamic-function marker sharing that ABI-encoding node is not an external trust boundary.
- Fully qualified public-field policy names match canonical declarations. Their authoritative decision resolves relationship-name ambiguity but never masks actual sink/trace incompleteness.

## Consequences

Accepted-risk and policy-approved findings remain visible exactly once. Getter and storage remain separate normative surfaces. Calldata rules from ADR 0004 are unchanged. The oracle, detector IDs, severity model, public SDK/CLI/SARIF/Action contracts, compiler, IR, graphs, and dataflow architecture are unchanged.
