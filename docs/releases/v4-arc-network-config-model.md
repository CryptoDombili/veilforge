# V4 Arc Trusted Network Configuration Model

Status: Phase 5D readiness model. It does not enable Arc mainnet, provide a mainnet registry address, or authorize a transaction.

## Trust boundary

The production proof runtime currently trusts only the versioned Arc Testnet entry in `packages/proof/v4/network.js`. Phase 5D adds a separate readiness model in `packages/proof/v4/mainnet-readiness.js`; it is not exported by the proof runtime and cannot make an unresolved network usable.

Mainnet values are deliberately `null` until official network references and an actual deployment receipt are reviewed. A value is not trusted merely because an environment variable or operator supplied it. Runtime callers must select a versioned `networkKey`; they must never accept an arbitrary RPC or registry address from a user.

## Required fields

| Field | Testnet classification | Mainnet Phase 5D value | Enablement rule |
| --- | --- | --- | --- |
| `networkKey` | Runtime public config | `arc-mainnet` | Exact versioned key |
| `environment` | Runtime public config | `mainnet` | Must not equal testnet |
| `chainId` | Runtime public config | `null` | Official source required |
| `chainName` | Runtime public config | `null` | Official source required |
| `nativeFeeAsset` | Runtime public config | `null` | Official source required |
| `rpcPublicReference` | Public documentation reference | `null` | HTTPS official reference; not a secret-bearing endpoint |
| `explorerBase` | Runtime public config | `null` | Verified HTTPS base |
| `registryAddress` | Runtime public config | `null` | Actual deployment only; zero rejected |
| `registryContractVersion` | Runtime public config | `2.0.0` candidate | Must match verified bytecode/ABI |
| `registryDeploymentBlock` | Runtime public evidence | `null` | Receipt-confirmed positive block |
| `registryDeploymentTx` | Runtime public evidence | `null` | Receipt-confirmed 32-byte tx hash |
| `deploymentStatus` | Runtime public status | `unresolved` | Must become `verified` after reconciliation |
| `enabled` | Release gate | `false` | Readiness sign-off required |
| `publishEnabled` | Send gate | `false` | Separate staged approval required |
| `proofReadEnabled` | Read gate | `false` | Bytecode/receipt verification required |
| `walletSwitchMetadata` | Runtime public config | `null` | Must bind the same chain ID/name |
| `configVersion` | Runtime public config | `1.0.0` | Exact supported version |

`verificationEvidence.networkSource` and `verificationEvidence.deploymentSource` are additionally required by the readiness validator. Both must be HTTPS references. This prevents “filled in” values from becoming trusted without provenance.

## Public and secret configuration

Public deployment inputs may be carried through these names after verification:

- `ARC_MAINNET_CHAIN_ID`
- `ARC_MAINNET_EXPLORER_BASE`
- `ARC_MAINNET_REGISTRY_ADDRESS`

Secret-bearing operational inputs are names only in source control:

- `ARC_MAINNET_RPC_URL`
- `ARC_MAINNET_DEPLOYER_KEY`
- `VEILFORGE_RELEASE_SIGNING_KEY`
- `ARC_MAINNET_MONITORING_TOKEN`
- `ARC_MAINNET_ADMIN_CREDENTIAL`

No example value is permitted for a private key, seed phrase, signing key, monitoring token, or administrator credential. A private RPC URL can embed a credential and must be handled as a secret even if chain data itself is public. CI must inject secrets at execution time, redact logs, and prohibit shell tracing.

## Fail-closed transitions

1. Unresolved: all mainnet identifiers are `null`; all gates are false.
2. Prepared: official network values are reviewed, but `enabled`, read, and publish remain false.
3. Deployed-unverified: an address/tx exists, but no runtime trust is granted.
4. Verified-read-only: bytecode, ABI, event, receipt, and explorer evidence match; only `proofReadEnabled` may become true.
5. Limited-publish: explicit operational approval may set `publishEnabled=true` for a bounded release cohort.
6. Rollback: all gates false and the trusted mainnet registry address is removed from the active runtime config.

Changing chain ID, registry address, deployment tx/block, ABI digest, runtime digest, or config version invalidates prior preflight state. Unsupported chains, zero addresses, wrong registries, and non-zero transaction value are blocking errors.

## Testnet separation

The trusted Testnet registry remains `0x88B4055eaB061CEa9BdfefF524f65ff461B5401d` on chain `5042002`. It must never populate a mainnet entry. A testnet transaction identity is not a mainnet identity; identity includes network key, chain ID, registry, publisher, and report hash.

