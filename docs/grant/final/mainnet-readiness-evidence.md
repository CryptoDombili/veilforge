# Arc Mainnet Production Evidence

Decision: **verified Arc Mainnet production profile GO within documented controls**.

## Current verified production identity

- Network key: `arc-mainnet`.
- Chain ID: `5042` (`0x13b2`).
- Registry V2: `0x43D76BfCa31eAd660C5d804FEe20d14C0c577337`.
- Deployment status: `verified`.
- Runtime bytecode digest: `sha256:183a480c37821dbdf8212a0454313c45f0ea49569448e712b0524bbfafab145d`.
- Contract getters: `REGISTRY_VERSION=2.0.0`; `PUBLISHER_SCOPED=true`.
- Production gates: `enabled=true`, `proofReadEnabled=true`, and `publishEnabled=true`.

The separately deployed Mainnet Registry was verified from transaction `0x2ad90b2d3c1343295cffbd770ae584bc6f086c0010aabc985ad1af1f8644789f` at block `21532278`. Receipt status, contract address, runtime bytecode, getters, gas, and actual fee were reconciled read-only in `deployment/arc-mainnet-registry-deployment.json`.

## Controlled first publication

One deterministic test fixture was published in transaction `0xc546c684ccc4a04ae2466926972a3c20d53c8b4616022f03240f4319d3de1693` at block `21545612`. Receipt, `ReportPublished` event, publisher, project ID, report hash, and Registry readback matched. The duplicate second-send guard was verified. Canonical evidence is stored in `deployment/arc-mainnet-proof-publication.json`.

This Mainnet evidence is separate from the historical Arc Testnet milestone in `docs/grant/final/arc-testnet-proof-evidence.md`. The Testnet Registry, transaction, publisher, and observed fee are not Mainnet identities or Mainnet fee estimates.

## Registry V2 decision

**Compatible with operational limitations.** Registry V2 is immutable, non-upgradeable, and has no owner, admin, pause, moderation, revocation, or protocol-wide recovery. Any address can publish its own publisher-scoped record. A publisher can replace its latest record for a project; contract-level duplicate immutability does not exist. Client identity checks, receipt/event/readback reconciliation, duplicate protection, and rollback controls remain mandatory.

## Rollback boundary

Rollback can disable future trust, reads, and sends and restore a previous client/config artifact. It cannot erase a deployed contract, transaction, event, record, fee, or leaked key. Canonical procedures are maintained in:

- `docs/releases/v4-arc-mainnet-readiness.md`
- `docs/releases/v4-arc-network-config-model.md`
- `docs/releases/v4-registry-deployment-manifest.md`
- `docs/releases/v4-arc-mainnet-deployment-runbook.md`
- `docs/releases/v4-arc-mainnet-rollback.md`
- `docs/releases/v4-arc-mainnet-incident-response.md`

Read-only/offline validation:

```powershell
npm.cmd run test:v4-mainnet-readiness
npm.cmd run verify:arc-mainnet-production
```

These commands validate evidence and the production artifact; they do not authorize a new Mainnet transaction.
