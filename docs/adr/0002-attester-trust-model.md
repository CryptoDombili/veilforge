# ADR-0002: Permissionless issuance with verifier allowlist

- Status: Accepted
- Applies to: Registry V3 and v4.0.0-gc.1 deployment gate

## Decision

Registry V3 may accept permissionless attestation issuance. Registration proves who published which digest; it does not make every issuer trusted.

The deployment gate trusts only issuers in the verifier's active allowlist. The initial allowlist contains the official VeilForge publisher. Records from all other issuers are informational and cannot pass the deployment gate.

The verifier must check issuer, chain ID, registry address/code/version, subject contract, bound hashes, expiry, revocation, and emitted event fields.

## Consequences

The allowlist is explicit policy state and must be included in deployment evidence. UI and CLI must distinguish `trusted`, `informational`, `revoked`, `expired`, and `unknown-registry` results.
