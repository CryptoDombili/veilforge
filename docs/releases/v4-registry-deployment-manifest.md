# V4 Registry V2 Deployment Manifest

Status: deterministic Phase 5D candidate manifest. Target mainnet address, deployment block, and transaction are intentionally unresolved. This document is not deployment evidence.

## Build identity

| Field | Value |
| --- | --- |
| Manifest version | `veilforge.registry.deployment.v1` |
| Contract | `VeilForgeReportRegistry` |
| Source | `contracts/VeilForgeReportRegistry.sol` |
| Compiler | `solc 0.8.24+commit.e11b9ed9.Emscripten.clang` |
| Optimizer | disabled, runs `200` |
| EVM version | `shanghai` |
| Metadata | `bytecodeHash=none`, `appendCBOR=false` |
| Constructor arguments | none (`[]`) |
| Release | `4.0.0-gc.1` |
| Baseline commit | `0d474396365c62af37a23fcb477ecb824454e5dd` |
| Phase 5D commit | unresolved until a later authorized commit |

## Deterministic digests

| Artifact | SHA-256 |
| --- | --- |
| Normalized source | `sha256:34f7fce947346237f3f651aa3d79a38e4b8b52f5cecaa5d4eb44794ffd5fa6f5` |
| Canonical compiler ABI | `sha256:ab6b794e1e18429bacc19c4b4ac130333995f83b9e0e9ebeadb59aa7c6b3ee17` |
| Creation bytecode | `sha256:85b7f7e9411d2e481b37cec7ec5af2062da46f979bbcd7e7179aaed8c76ae583` |
| Runtime bytecode | `sha256:183a480c37821dbdf8212a0454313c45f0ea49569448e712b0524bbfafab145d` |
| Constructor args (`0x`) | `sha256:a54942c8e365f3784f38b8d437f9d708290db60738b00cdcfb934c32d1be97f3` |
| Complete rehearsal manifest | `sha256:46338f5b5b9660689c727ebc060806b2394e5e95222b7e49be5d82bc24148ec6` |

These digests describe the Phase 5D compiler settings, not necessarily the historical Testnet deployment settings. Mainnet verification must compare the deployed runtime against the exact artifact generated for the authorized release.

## Expected selectors

| Signature | Selector |
| --- | --- |
| `publishReport(bytes32,bytes32,bytes32,uint16,string,string)` | `0x6133eb3a` |
| `getLatestReport(bytes32,address)` | `0x99ff9bf1` |
| `getMyLatestReport(bytes32)` | `0xf6e16b4a` |
| `hasReport(bytes32,address)` | `0x62c620f2` |
| `REGISTRY_VERSION()` | `0x6e8d6f6f` |
| `PUBLISHER_SCOPED()` | `0xcd3e4daa` |

Expected event topic:

`ReportPublished(bytes32,bytes32,bytes32,uint16,string,string,address)` → `0x795d395ffb3e77bfca2c9f7b22a91924b5e2c5135a55b3c4b34395c7e677c7a9`

## Verification status

| Check | Status |
| --- | --- |
| Clean compile | Passed |
| Deterministic artifact generation | Passed |
| ABI/selector/event consistency | Passed |
| Constructor args | Passed: none |
| Sample `publishReport` calldata encoding | Passed; value remains `0x0` |
| Ownership/admin source inspection | Passed: no owner/admin/pause/upgrade surface |
| Local EVM deployment execution | Not run: no ephemeral EVM runtime is present in this dependency set |
| Existing Testnet live execution | Proven separately by reconciled transaction evidence |
| Mainnet deployment | Not performed |

The reproducible command is `npm run rehearse:arc-mainnet-registry`. It compiles locally and performs no RPC, wallet, signing, or transaction operation.

## Deployment fields intentionally blank

- Target chain ID/name/native fee asset: unresolved pending official source review.
- Mainnet registry address: `null` until actual deployment.
- Deployment block and transaction: `null` until successful receipt reconciliation.
- Explorer verification: not performed.
- Deployer identity: not recorded in source; governed by the deployer policy.

Deployer policy: a controlled deployer distinct from the operational publisher, with no testnet wallet reused as mainnet administration. Registry V2 exposes no post-deployment owner role to transfer or reduce.

