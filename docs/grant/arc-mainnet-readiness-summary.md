# Arc Mainnet Readiness Summary

VeilForge V4 has a deployed and proven Registry V2 on Arc Testnet. A real V4 report publication succeeded at transaction `0xdb674c986195ed9b3950f34d058637fbb2b887f58ca724400225ba177884192c`; its receipt, event, registry, publisher, and report hash were reconciled, and duplicate protection blocks a second send for the same publication identity.

Mainnet deployment is intentionally gated. VeilForge does not claim an Arc mainnet chain configuration, registry address, deployment transaction, or production availability before official network evidence, independent contract review, controlled deployment, bytecode/receipt verification, and staged operational acceptance are complete.

Phase 5D adds:

- a versioned, fail-closed mainnet config model with unresolved values and publishing disabled;
- deterministic Registry V2 source/ABI/bytecode/selectors/event manifesting;
- public/secret configuration separation without secret examples;
- deployer, publisher, key-loss, and compromised-key policies;
- gas/value/USDC fee review boundaries based on historical Testnet evidence, not mainnet cost claims;
- chain-aware Testnet-to-mainnet migration;
- staged rollout, rollback, and incident-response runbooks.

Registry V2 is assessed as compatible with operational limitations. It is immutable and has no owner, admin, upgrade, or pause capability; recovery from a bad deployment is client-side trust removal and, after review, a new deployment. Independent contract review and an ephemeral EVM deployment rehearsal remain mainnet prerequisites.

Grant evidence decision: **GO** for Product Polish and the Final Grant Evidence Package. Mainnet deployment/publishing decision: **NO-GO** until the documented blockers are resolved. No mainnet transaction, deployment, key request, production flag change, or deploy occurred in Phase 5D.

