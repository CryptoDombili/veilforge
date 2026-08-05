# V4 Arc Mainnet Rollback

Status: operational plan; no deployment or production enablement is authorized.

## Rollback invariant

Rollback can stop new trust and new sends. It cannot delete a deployed contract, transaction, event, report anchor, fee payment, or compromised public-chain history.

## Immediate rollback state

- `publishEnabled=false`
- `proofReadEnabled=false` until the registry is independently safe to read
- mainnet readiness `enabled=false`
- production V4 feature flag false
- transaction sending disabled
- active trusted mainnet `registryAddress=null`
- previous signed trusted-config version restored
- previous V3/V4 web build selected through the authorized release process
- Testnet retained only with unmistakable Testnet labels

The generated `mainnetRollbackConfig()` enforces the disabled configuration locally. It is not a remote kill switch and cannot modify Registry V2.

## Rollback triggers

- Wrong chain, registry, explorer, deployment tx/block, or runtime digest.
- Receipt/event/report/publisher mismatch.
- Mainnet config or release-manifest tampering.
- Publisher/deployer/signing-key compromise.
- Unexpected non-zero value, fee spike, repeated revert, or unreliable estimates.
- Duplicate protection or user-gesture boundary failure.
- Stale UI/config caching or unsafe automatic switch/send behavior.
- RPC responses inconsistent across approved providers.

## Procedure

1. Announce incident ownership and freeze deployment/publishing approvals.
2. Set publish and send gates false; set production feature flag false.
3. Remove the affected mainnet registry from active trusted config. Do not replace it with a user-entered address.
4. If chain evidence remains trustworthy, optionally preserve a separately approved read-only mode; otherwise disable reads too.
5. Roll back the web build through the existing Vercel rollback procedure only when an authorized deployment operator performs it. Phase 5D performs no Vercel action.
6. Restore the previous signed config and V3/V4 web build; invalidate caches according to the web rollback runbook.
7. Preserve Testnet configuration and local V3/V4 history without rewriting chain identities.
8. Reconcile all potentially affected transactions and notify users that on-chain records cannot be removed.
9. Rotate exposed operational credentials and publisher identities; the immutable registry has no admin key to rotate.
10. Resume at stage 1 or read-only only after root cause, independent verification, and a repeated rollback drill.

## Registry replacement

If the deployed address or bytecode is wrong, Registry V2 cannot be upgraded or paused. Deploy a new contract only after a new review and approval cycle, assign a new trusted config version, and retain the old address as untrusted historical evidence. Do not call this an upgrade and do not silently rewrite existing proof identities.

## Backup and recovery evidence

- Preserve the last known-good branch and release tag; Phase 5D does not create or move either.
- Preserve signed manifest/config artefacts and their digests.
- Preserve prior web build identifiers and Vercel rollback instructions.
- Record the disabled config, incident timestamp, affected chain/address, and verified transaction list without secrets or source code.

