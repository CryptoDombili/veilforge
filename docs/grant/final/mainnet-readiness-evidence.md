# Arc Mainnet Readiness Evidence

Decision: **readiness package GO; Arc mainnet deployment and publishing NO-GO**.

## GO — available readiness evidence

- Versioned fail-closed mainnet readiness model.
- `enabled=false`, `proofReadEnabled=false`, and `publishEnabled=false` defaults.
- Unresolved chain, RPC, explorer, fee-asset, registry, deployment block, and transaction fields remain null/untrusted.
- Deterministic Registry V2 source, ABI, creation/runtime bytecode, selector, event-topic, ownership, value, and calldata manifesting.
- Deployment rehearsal procedure that performs no RPC, wallet, signing, or transaction action.
- Staged rollout, rollback, incident response, key policy, and Testnet-to-mainnet migration plans.
- Existing Testnet receipt/event reconciliation as execution evidence, clearly separated from mainnet.

## NO-GO — unresolved prerequisites

- No real Arc mainnet deploy or registry identity.
- Official mainnet chain ID/name, public RPC reference, explorer, and native fee asset are unresolved.
- Independent contract/security review is not recorded.
- Controlled ephemeral deployment rehearsal is pending.
- Named deployment, publication, incident, signing, custody, and change-approval owners are pending outside source control.
- Mainnet fee behavior, balance UX, monitoring, and provider redundancy are unvalidated.

## Registry V2 decision

**Compatible with operational limitations.** Registry V2 is immutable, non-upgradeable, and has no owner, admin, pause, moderation, revocation, or protocol-wide recovery. Any address can publish its own publisher-scoped record. A publisher can replace its latest record for a project; contract-level duplicate immutability does not exist. Bad deployment/config recovery requires client trust removal and, after review, a new deployment. Independent review remains mandatory before mainnet.

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
npm.cmd run rehearse:arc-mainnet-registry
```

These commands do not authorize a mainnet transaction or deployment.

