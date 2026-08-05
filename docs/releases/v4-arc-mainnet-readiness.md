# V4 Arc Mainnet Readiness

Status: **mainnet deployment and publishing NO-GO; Product Polish / Final Grant Evidence GO**. Phase 5D creates readiness controls only. No Arc mainnet address, transaction, deployment, or production enablement is claimed.

## Inventory classification

| Classification | Current evidence and boundary |
| --- | --- |
| Testnet-only configuration | Chain `5042002`, Arc Testnet RPC/explorer metadata, Registry V2 `0x88B4055eaB061CEa9BdfefF524f65ff461B5401d`, reconciled testnet tx |
| Mainnet-ready reusable | Registry V2 source/ABI, V4 proof envelope, report schema `4.1.0`, hash payload `veilforge.report.hash.v2`, receipt/event validation, publisher-scoped duplicate lookup |
| Mainnet values required | Official chain ID/name, fee asset, public RPC reference, explorer base, deployed registry address/block/tx |
| Deployment-time secrets | RPC credential, deployer key, release signing key, monitoring/admin credentials; names only in source |
| Runtime public config | Verified chain/explorer/registry/version/deployment evidence and config version |
| Operational/admin risks | Immutable no-admin registry, key compromise, wrong config, RPC/explorer outage, fee volatility, unrestricted direct publishers |
| Contract migration risks | Testnet records do not migrate; client schema compatibility; publisher-scoped latest-record overwrite semantics |
| Rollback-capable | Web feature flag, publish/read gates, trusted config, transaction send boundary, web build, testnet fallback |
| Irreversible | Contract deployment, published transactions/events/storage, leaked keys, funds spent on gas |
| Grant/demo evidence | Testnet Registry V2, real V4 publication, receipt/event/hash reconciliation, deterministic offline manifest, documented gates |

## Contract compatibility decision

**Compatible with operational limitations; independent contract review remains a pre-mainnet gate.** A Registry V3 is not justified by Phase 5D evidence.

Evidence from `VeilForgeReportRegistry.sol`:

- Fixed `solc 0.8.24` and fixed settings produce deterministic creation/runtime artifacts.
- There are no constructor arguments, owner/admin role, proxy, upgrade function, delegatecall, pause, or emergency control.
- `publishReport` is external and non-payable. Any non-zero value reverts at the EVM boundary.
- Input validation rejects zero project/source/report hashes, scores over 100, and empty scanner version.
- Records are scoped by `projectId + msg.sender`; one publisher cannot overwrite another publisher’s record.
- The same publisher can overwrite its latest record for a project. Contract-level duplicate immutability does not exist; client reconciliation/idempotency remains mandatory.
- There are no loops over storage, but unique project/publisher pairs can grow storage indefinitely. Direct callers can also submit long strings beyond UI caps and pay the corresponding gas/storage cost.
- Any address may publish its own scoped record. There is no allowlist, revocation, moderation, or protocol-wide admin recovery.
- V3/V4 compatibility is provided by bytes32 anchors and versioned `scannerVersion`; the contract does not validate report schema semantics on-chain.

The absence of admin/upgrade control reduces key-based governance risk but makes deployment/config mistakes irreversible. Recovery is a new deployment plus client trust-config migration; the old contract cannot be paused or upgraded.

## Existing Testnet evidence

- Registry V2 address: `0x88B4055eaB061CEa9BdfefF524f65ff461B5401d`.
- Real V4 publication: `0xdb674c986195ed9b3950f34d058637fbb2b887f58ca724400225ba177884192c`.
- Method/value: `publishReport`, value `0`.
- Observed Testnet fee: `0.001175966 USDC`.
- Receipt, event, publisher, registry, and report hash were reconciled in Phase 5C-3B.

The observed fee is historical Testnet evidence only. It is not a mainnet estimate, quote, cap, or guarantee.

## Gas and USDC fee model

Before any proposed mainnet transaction, the read-only preflight must:

1. Verify official chain identity and trusted registry bytecode.
2. Build the exact transaction with `value=0x0`.
3. Run `eth_call` simulation from the selected publisher.
4. Run `eth_estimateGas`; display unavailable rather than inventing an estimate.
5. Query/display the verified native fee asset and wallet balance through an approved provider adapter.
6. Present gas units, fee parameters supplied by the provider, and a volatility disclosure immediately before user review.
7. Block insufficient fee balance, stale state binding, duplicate publication, non-zero value, wrong chain, or registry mismatch.

No repository code currently promises an EIP-1559 max-fee cap for mainnet. A max-fee strategy must be added only after official network transaction semantics are verified; until then it is unresolved. Automatic wallet switching or sending is prohibited. A fresh explicit user gesture and review are required.

## Readiness blockers before mainnet deployment

- Official mainnet chain, RPC-reference, explorer, and native fee asset evidence is unresolved.
- No mainnet Registry V2 deployment exists; address/block/tx remain `null`.
- Independent contract/security review is not recorded.
- An ephemeral EVM deployment execution was not available in the current dependency set; it must be completed in an approved rehearsal environment.
- Deployer custody, release signing, monitoring, incident ownership, and change approval must be assigned to named operators outside source control.
- Production mainnet fee behavior and balance UX have not been validated.

These blockers prevent mainnet deployment/publishing, but not continuation to Product Polish and grant evidence preparation.

