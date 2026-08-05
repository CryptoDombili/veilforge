# V4 Arc Mainnet Deployment and Migration Runbook

Status: rehearsal-only. This runbook does not authorize mainnet deployment, wallet connection, signing, or publishing.

## Roles and separation of duties

| Role | Responsibility | Prohibition |
| --- | --- | --- |
| Release approver | Approves exact commit, manifest, official network evidence, and rollout stage | Must not approve their own unreviewed artifact |
| Controlled deployer | Executes the one authorized deployment from a secured environment | Must not be a burner or reused Testnet wallet |
| Operational publisher | Publishes approved report proofs after deployment | Must not hold deployment/signing secrets by default |
| Verifier | Independently checks receipt, runtime, ABI, selectors, event, and explorer metadata | Must not trust operator-supplied address without chain evidence |
| Incident lead | Can disable config/publishing and coordinate response | Cannot pause or upgrade Registry V2 on-chain |

Registry V2 has no owner/admin, transfer, pause, or upgrade mechanism. Consequently there is no ownership-transfer transaction to rehearse and no deployer permission to reduce after deployment. The deployer’s only special significance is transaction provenance; it receives no contract role. Governance must therefore focus on release approval, key custody, trusted config, and publisher access.

## Key policy

- Use a controlled institutional account or multisig-governed deployment process where the network/tooling supports it; do not invent a contract multisig owner role.
- Keep deployer and operational publisher distinct.
- Never reuse the Testnet wallet as a mainnet administrator or deployer.
- Inject `ARC_MAINNET_DEPLOYER_KEY`, RPC credentials, and `VEILFORGE_RELEASE_SIGNING_KEY` only in the approved execution environment.
- Disable shell tracing, redact provider URLs, and retain no key in logs, fixtures, history, screenshots, or artefacts.
- If a deployer key is lost before deployment, rotate it. If compromised before deployment, cancel the release. After deployment it has no Registry V2 privilege, but compromise must still be investigated for unauthorized transactions.
- If a publisher key is lost, historical records remain chain-verifiable; issue a new publisher identity and communicate that publisher-scoped continuity changes. A compromised publisher cannot alter other publishers’ records but can overwrite its own latest records.

## Offline rehearsal procedure

1. Confirm the authorized branch/commit and clean release-source scope.
2. Run `npm run rehearse:arc-mainnet-registry` with no RPC or wallet environment variables.
3. Confirm exact `solc 0.8.24`, optimizer disabled/runs 200, Shanghai EVM, and metadata-free bytecode settings.
4. Compare source, ABI, creation/runtime bytecode, and constructor-args digests with `v4-registry-deployment-manifest.md`.
5. Confirm no constructor args and creation/runtime bytecode are non-empty.
6. Confirm all expected method selectors and the `ReportPublished` topic.
7. Confirm sample `publishReport` calldata uses selector `0x6133eb3a` and transaction value `0x0`.
8. Confirm source inspection reports no owner/admin/upgrade/pause surface.
9. Run the targeted mainnet-readiness, proof-network, proof-receipt, and Registry V2 regression tests.
10. In an approved ephemeral EVM environment, deploy the exact creation bytecode, verify runtime code, simulate publish/event/duplicate behavior, and destroy the environment. Phase 5D did not perform this step because no ephemeral EVM runtime is installed.

## Mainnet preparation gates

Before deployment approval, all of the following are required:

- Official, independently reviewed chain ID/name, native fee asset, RPC documentation reference, and explorer base.
- Independent Registry V2 contract/security review and signed acceptance of operational limitations.
- Reproduced deterministic manifest from the exact release commit.
- Successful ephemeral EVM deployment and V3/V4 proof-compatibility rehearsal.
- Controlled deployer custody, funding limit, and two-person release approval.
- Monitoring and incident ownership assigned.
- `enabled=false`, `proofReadEnabled=false`, `publishEnabled=false`, production feature flag false.
- Previous V3/V4 web build and trusted-config rollback artefacts available.

## Authorized deployment sequence (future only)

1. Reconfirm the official network using two reviewed references and a read-only chain query.
2. Verify the deployer address and bounded fee balance without exposing credentials.
3. Rebuild from the approved commit and compare manifest digest.
4. Estimate deployment gas; stop if unavailable, unexpectedly high, or outside the approved budget.
5. Present exact chain, deployer, bytecode digests, constructor args `[]`, value `0`, and fee review to two approvers.
6. Send exactly one deployment transaction through the approved custody system.
7. Reconcile status, chain, deployer, block, created address, and runtime code from the receipt.
8. Verify ABI selectors/event topic, `REGISTRY_VERSION=2.0.0`, `PUBLISHER_SCOPED=true`, and read methods.
9. Record address/block/tx only from verified receipt evidence; never copy an unverified value into trusted config.
10. Publish explorer metadata/source verification if supported, without treating explorer availability as chain truth.
11. Keep publish/read gates false until an independent verifier signs off.

## Read-only and limited-publish acceptance

After deployment, enable read-only first. Verify runtime digest, selector, deployment receipt, and empty publisher record. For the internal publisher test:

- use a dedicated operational publisher, not deployer;
- use a non-sensitive, deterministic V4 report fixture;
- require report/envelope integrity and user-gated review;
- require `value=0`, fresh `eth_call`, gas estimate, and fee-balance display;
- publish once only after explicit approval;
- reconcile receipt/event/report hash/publisher/registry/chain;
- rerun duplicate lookup and verify `already-published`, `transactionRequest=null`, and second-send blocked.

An internal publication is irreversible and must be clearly labeled as mainnet test evidence.

## Testnet-to-mainnet migration

- Do not copy Testnet registry storage or replay Testnet transaction identities.
- Testnet records and explorer links remain labeled Testnet permanently.
- The same canonical report hash may be published separately on mainnet after explicit approval.
- Publication identity remains chain-aware: network key + chain ID + registry + publisher + report hash.
- Preserve V3 and V4 local history; add a new mainnet identity rather than rewriting Testnet history.
- UI must show an explicit network badge and trusted explorer destination.
- Retain Testnet for testing after mainnet activation.
- Rolling back mainnet config must not delete local history or hide already-published chain evidence.

## Staged rollout matrix

| Stage | Entry criteria | Verification | Rollback trigger | Responsible action | Irreversible risk |
| --- | --- | --- | --- | --- | --- |
| 1. Config prepared, publish disabled | Official network evidence reviewed | Schema validation; all gates false | Any unresolved/mismatched field | Release approver removes candidate config | None on-chain |
| 2. Contract deployed, read-only | Approved manifest/review/custody | Receipt, address, runtime, block, tx | Failed receipt or runtime mismatch | Keep config disabled; incident process | Deployment tx/code cannot be removed |
| 3. Registry verified | Independent ABI/event/source checks | Selectors, version, scoped reads | ABI/topic/version mismatch | Reject address; prepare new reviewed deployment | Bad deployment remains on-chain |
| 4. Internal publisher test | Read-only sign-off and bounded fee approval | One fixture publish + receipt/event/hash reconciliation | Revert, mismatch, unexpected fee | Disable send and mainnet trust | Publication cannot be deleted |
| 5. Limited publish | Internal test and rollback drill pass | Cohort checklist, duplicate protection, monitoring | Any integrity/config/fee incident | `publishEnabled=false`; read-only if safe | Cohort transactions remain |
| 6. Production opt-in | Security/ops sign-off | Per-session explicit opt-in and telemetry-free checklist | Support or mismatch threshold | Disable opt-in and sending | Prior transactions remain |
| 7. Production default | Separate release decision and evidence | Default-mode acceptance and incident drill | Any material regression | Feature flag false; previous build | Prior transactions remain |
| 8. Testnet retained | Mainnet stable and test policy approved | Testnet badge/config isolation | Identity or routing confusion | Disable affected network entry | Existing records remain |

## Current rehearsal result

Offline compile, digest, ABI, selectors, event topic, calldata, value boundary, ownership inspection, config fail-closed behavior, identity separation, and rollback generation passed. Existing Testnet publication supplies live execution evidence. Ephemeral EVM deployment and mainnet RPC/deployment remain explicitly unperformed and are mandatory future gates.

