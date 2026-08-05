# ADR 0004: Calldata Observation Semantics

Status: accepted for v4.0.0-gc.1.

## Context

The Phase 4B-2 benchmark reported 112 false positives for the three calldata-observation detectors while preserving three true positives and zero false negatives. The classifier materializes a value node for a parameter declaration and for later references. Treating every source/sink trace pair as an independent occurrence therefore multiplied one ABI fact into several findings. It also duplicated stronger findings when the same raw parameter flowed to an event, external call, metadata boundary, revert, raw return, or public storage boundary.

## Decision

Calldata findings use a shared semantic-occurrence layer after source/sink classification and before detector-result construction.

- The occurrence identity is based on detector, parameter symbol, callable, contract, financial data class, and policy disposition.
- Declaration and use traces are merged into a deterministic canonical occurrence. Supporting trace identities and evidence remain available.
- A name-token heuristic without financial or authoritative context is filtered.
- A raw stronger disclosure boundary suppresses only the redundant calldata observation. Derived expressions, including boolean comparisons, do not qualify as raw disclosure.
- ABI-boundary completeness is not downgraded by unrelated downstream incompleteness.
- Explicit policy labels, public-field decisions, accepted risks, and genuine incomplete states retain their original semantics.

## Consequences

The three domain packs share one rule and cannot drift independently. Finding count and fingerprints no longer depend on traversal order or the number of equivalent parameter references. The benchmark comparison must preserve calldata true positives and zero false negatives, keep overall false negatives at or below the Phase 4B-2 baseline, and demonstrate a material reduction from 112 calldata false positives. Other detector metrics are a regression gate.

This decision does not alter the financial taxonomy, detector identities, benchmark oracle, severity model, release gate thresholds, or any legacy analyzer behavior.
