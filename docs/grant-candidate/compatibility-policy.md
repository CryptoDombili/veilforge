# Compatibility Policy

Status: **SUPERSEDED phase-1 policy.** The current canonical report schema is `4.1.0`; legacy `4.0.0`/hash-v1 verification remains isolated. See [`../RELEASE_STATUS.md`](../RELEASE_STATUS.md). The text below is retained as the original compatibility decision record.

## Version boundary

V4 report, finding, policy, identity, and attestation formats are breaking changes. V3.2.2 reports remain readable as legacy evidence but must not be silently converted into V4 attestations.

## Scanner behavior

- V4 emits only schema version `4.0.0`.
- V4 accepts only exact compiler version `0.8.24` for the Grant Candidate.
- V3 report import is read-only and clearly labeled `legacy-v3`.
- A V3 project must be recompiled and reanalyzed to receive V4 finding IDs, report hashes, policy decisions, or attestations.

## Registry behavior

Registry V2 remains historical. Registry V3 uses a separate contract address and attestation schema. A V2 publication is not a V3 deployment attestation.

## Schema evolution

Additive optional fields may use a compatible schema revision. Changes to canonicalization, identity, required fields, hash inputs, or trust semantics require a new schema or domain version.
