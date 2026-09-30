# Arc Mainnet Readiness Summary — Historical Phase 5D Evidence

> **Historical / pre-deployment evidence:** This document records the Phase 5D readiness decision before Arc Mainnet deployment. It is retained to preserve the original gates and Testnet milestone. It is not the canonical current production status; see [`docs/RELEASE_STATUS.md`](../RELEASE_STATUS.md).

## Current verified production state

| Field | Current value |
|---|---|
| Product | VeilForge V4 Grant Candidate |
| Network key | `arc-mainnet` |
| Chain ID | `5042` / `0x13b2` |
| Registry V2 | `0x43D76BfCa31eAd660C5d804FEe20d14C0c577337` |
| Deployment status | `verified` |
| Runtime flags | `enabled=true`, `proofReadEnabled=true`, `publishEnabled=true` |
| Deployment transaction | `0x2ad90b2d3c1343295cffbd770ae584bc6f086c0010aabc985ad1af1f8644789f` |
| First controlled Mainnet proof | `0xc546c684ccc4a04ae2466926972a3c20d53c8b4616022f03240f4319d3de1693` |

The deployment receipt, deployed runtime, Registry getters, controlled proof receipt/event/readback, and duplicate-send guard were verified before the production publishing flag was enabled.

## Historical Phase 5D record

At Phase 5D, VeilForge V4 had a deployed and proven Registry V2 on Arc Testnet. A real V4 report publication succeeded at transaction `0xdb674c986195ed9b3950f34d058637fbb2b887f58ca724400225ba177884192c`; its receipt, event, registry, publisher, and report hash were reconciled, and duplicate protection blocked a second send for the same publication identity. This remains historical Arc Testnet milestone evidence.

Mainnet deployment was intentionally gated at that time. VeilForge did not claim an Arc Mainnet chain configuration, registry address, deployment transaction, or production availability before official network evidence, independent contract review, controlled deployment, bytecode/receipt verification, and staged operational acceptance were complete.

Phase 5D added:

- a versioned, fail-closed mainnet config model with unresolved values and publishing disabled;
- deterministic Registry V2 source/ABI/bytecode/selectors/event manifesting;
- public/secret configuration separation without secret examples;
- deployer, publisher, key-loss, and compromised-key policies;
- gas/value/USDC fee review boundaries based on historical Testnet evidence, not mainnet cost claims;
- chain-aware Testnet-to-mainnet migration;
- staged rollout, rollback, and incident-response runbooks.

Registry V2 was assessed as compatible with operational limitations. It is immutable and has no owner, admin, upgrade, or pause capability; recovery from a bad deployment is client-side trust removal and, after review, a new deployment. Independent contract review and an ephemeral EVM deployment rehearsal were Mainnet prerequisites.

The historical Phase 5D decision was **GO** for Product Polish and the Final Grant Evidence Package and **NO-GO** for Mainnet deployment/publishing until the documented blockers were resolved. No Mainnet transaction, deployment, key request, production flag change, or deploy occurred during Phase 5D. Those prerequisites were subsequently completed through the controlled deployment and publication phases represented in the current state above.

