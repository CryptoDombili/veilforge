# Arc Mainnet Registry Migration and Incident Runbook

## Current security model

The deployed `VeilForgeReportRegistry` V2 is immutable. It has no owner, pause switch, administrator, proxy, or upgrade path. This removes privileged mutation risk, but an incident cannot be patched in place. Production configuration must remain pinned to the verified address, chain ID, runtime bytecode digest, ABI, and evidence manifests.

`reportURI` is an untrusted locator, not proof of report content. Clients must bind the reviewed URI to calldata, the `ReportPublished` event, and current Registry storage. Content fetched from a locator is accepted only after canonical V4 report verification reproduces the on-chain `reportHash`. A locator must never be rendered as trusted HTML or used as an authority by itself.

The contract accepts dynamically sized `scannerVersion` and `reportURI` strings. The production client caps these fields and emits an empty URI today, but the immutable contract does not enforce those limits. Paid on-chain state or log spam by arbitrary publishers remains an accepted residual risk. Adding contract-level length limits would change deployed bytecode and requires a new deployment.

## Incident response

1. Disable `publishEnabled` in source and production configuration. Keep read-only verification available only if the deployed runtime and evidence still verify.
2. Stop production artifact promotion. Preserve the affected artifact, source commit, transaction hashes, receipts, and read-only RPC evidence.
3. Classify whether the issue is client-only, configuration-only, RPC compromise, Registry semantic failure, or deployed bytecode mismatch.
4. For a client-only issue, patch and independently review a commit-bound production artifact before restoring publishing.
5. For a Registry issue, do not repoint configuration silently. Start the migration procedure below.
6. Never retry an ambiguous wallet submission. Reconcile its transaction hash and current publisher-scoped record first.

## Registry migration procedure

1. Specify the new Registry version and document every ABI, storage, event, publisher-scoping, string-bound, and trust-model change.
2. Add a separate network deployment record. Never reuse a Testnet address or mutate historical evidence.
3. Compile reproducibly, rehearse locally and on Testnet, and obtain independent review of source, creation bytecode, runtime bytecode, and deployment tooling.
4. Require a chain-ID-locked deployment flow and explicit human wallet approval for the single contract-creation transaction.
5. Verify the Mainnet receipt, contract address, runtime digest, version/capability getters, deployer, block, gas, and actual fee using read-only RPC calls.
6. Commit a deployment evidence manifest while publishing remains disabled.
7. Enable read-only support first. Verify old and new Registry histories distinctly; do not represent historical receipts as proof of current storage.
8. Run one explicitly approved publication fixture, reconcile receipt/event/current storage, and commit its evidence.
9. Promote only a commit-bound, byte-attested production artifact after the complete regression and security matrix passes.
10. Retain the previous Registry address and evidence for historical verification. A new Registry is a new trust root, not an in-place upgrade.

## Redeployment decision for this remediation

This remediation does not change Registry source or deployed semantics. URI trust is closed at the client and verifier boundaries, and the unbounded-string issue is documented as an accepted residual risk. Therefore these fixes do not require immediate contract redeployment. Contract-enforced string limits, pausing, administration, or upgradeability would require a separately reviewed new Registry deployment and must not be introduced as a silent remediation.
