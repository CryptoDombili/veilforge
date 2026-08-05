# Technical Evidence Index

Status values: **Shipped and verified**, **Shipped with bounded limitations**, **Roadmap**, **Mainnet unresolved**, **Commercial hypothesis**, and **Not claimed**.

## Evidence inventory

| Evidence area | Classification | Canonical source |
|---|---|---|
| Compiler, AST, IR, CFG, call graph, dataflow | Shipped and verified | `packages/analyzer/src/v4/`, `docs/releases/v4.0.0-rc1.md` |
| Arc detector packs and maintained oracle | Shipped and verified | `packages/analyzer/src/v4/detectors/`, `benchmarks/v4/oracle.json` |
| CLI, SDK, SARIF, GitHub Action, policy gate | Shipped and verified | `packages/cli/`, `packages/sdk/`, `packages/sarif/`, `action.yml`, `packages/gate/` |
| Browser V4 runtime and product polish | Shipped with bounded limitations | `apps/web/v4/`, `docs/releases/v4-web-browser-support.md` |
| Grant whitepaper and executive brief | Shipped and verified | `docs/whitepaper/veilforge-v4-whitepaper.md`, `docs/whitepaper/veilforge-v4-whitepaper-executive-brief.md` |
| Grant landing, web readers, PDFs, and five evidence figures | Shipped and verified | `apps/web/v4-grant-landing.css`, `apps/web/whitepaper/`, `docs/whitepaper/figures/` |
| Report schema/hash and proof envelope | Shipped and verified | `schemas/`, `packages/analyzer/src/v4/report/`, `packages/proof/v4/` |
| Arc Testnet transaction/reconciliation/duplicate protection | Shipped and verified | `docs/releases/v4-arc-testnet-proof-acceptance.md` |
| Mainnet readiness model/runbooks | Shipped with bounded limitations | `packages/proof/v4/mainnet-readiness.js`, `docs/releases/v4-arc-mainnet-readiness.md` |
| Mainnet deployment and production publishing | Mainnet unresolved | `docs/releases/v4-registry-deployment-manifest.md` |
| Community/open local core | Shipped and verified | `docs/business/free-vs-paid-feature-matrix.md` |
| Hosted CI/accounts/team workflows | Roadmap | `docs/business/commercial-roadmap.md` |
| Pricing and twelve-month scenarios | Commercial hypothesis | `docs/business/pricing-hypothesis.md`, `docs/business/twelve-month-scenarios.md` |
| Customers, partnerships, endorsement, revenue, grant award | Not claimed | This package and `docs/business/customer-profiles.md` |

## Claim-to-evidence matrix

| Claim | Status | Evidence file/path | Test/result | Limitation | Reproduction command |
|---|---|---|---|---|---|
| Exact compiler-backed analysis | Shipped and verified | `packages/analyzer/src/v4/frontend/compile-project.js` | Exact solc 0.8.24 baseline | Other compiler versions may be unsupported | `npm.cmd run test:v4-frontend` |
| AST/IR/CFG/call graph/dataflow | Shipped and verified | `packages/analyzer/src/v4/frontend/`, `ir/`, `analysis/` | Compiler/IR/dataflow suites passed in release baseline | Conservative budgets and incomplete states | `npm.cmd run test:v4-ir` and `npm.cmd run test:v4-dataflow` |
| Arc detector packs | Shipped and verified | `packages/analyzer/src/v4/detectors/` | Three maintained domain packs; benchmark 60/60 | Scope does not cover all Solidity semantics | `npm.cmd run test:v4-detectors` |
| Deterministic verified report | Shipped and verified | `packages/analyzer/src/v4/report/`, `schemas/` | Schema 4.1.0, hash v2, nondeterminism 0 | Reports contain sensitive evidence | `npm.cmd run test:v4-report-determinism` |
| CLI and SDK | Shipped and verified | `packages/cli/`, `packages/sdk/` | Worker-isolated CLI and ESM SDK regression passed | Node.js 20+ | `npm.cmd run test:v4-cli` and `npm.cmd run test:v4-sdk` |
| SARIF and GitHub Action | Shipped and verified | `packages/sarif/`, `action.yml` | SARIF 2.1.0 and Action integration tests passed | CI integration; not browser-native | `npm.cmd run test:v4-sarif` and `npm.cmd run test:v4-action` |
| Policy release gate | Shipped and verified | `packages/gate/` | `passed / allow`, gate FN 0 | Policy quality remains an operator responsibility | `npm.cmd run smoke:v4-release-gate` |
| Browser runtime | Shipped with bounded limitations | `apps/web/v4/runtime/` | Real Chromium scan and responsive 1920–360 passed | 1 MiB; exact solc; Firefox/Edge clean-CI pending | `npm.cmd run smoke:web-v4-ui-responsive` |
| Local-first privacy | Shipped with bounded limitations | `apps/web/v4/`, `docs/releases/v4-web-rollout-rollback.md` | No source persistence/upload in targeted smoke | Reports and local history can be sensitive | `npm.cmd run test:web-v4-security` |
| Proof envelope/core | Shipped and verified | `packages/proof/v4/` | V4 proof 81/81 baseline | Anchors evidence; does not certify confidentiality | `npm.cmd run test:v4-proof` |
| Arc Testnet publish | Shipped and verified | `docs/releases/v4-arc-testnet-proof-acceptance.md` | Real successful tx at block 55469453 | Testnet only | `npm.cmd run reconcile:web-v4-proof-arc-readonly` |
| Receipt/event verification | Shipped and verified | `apps/web/v4/proof-receipt.js` | Receipt suite 11/11; live reconciliation passed | Trusted chain/registry required | `npm.cmd run test:web-v4-proof-receipt` |
| Duplicate protection | Shipped and verified | `apps/web/v4/proof-network-preflight.js` | `already-published`; no second send | Client-side idempotency over publisher-scoped Registry V2 | `npm.cmd run test:web-v4-proof-transaction-acceptance` |
| Browser acceptance | Shipped with bounded limitations | `docs/releases/v4-web-browser-support.md` | Chromium/WebKit local acceptance evidence | Edge/Firefox local environment remains unverified | `npm.cmd run test:web-v4-acceptance` |
| Mainnet readiness controls | Shipped with bounded limitations | `packages/proof/v4/mainnet-readiness.js` | Readiness 9/9 baseline | Deployment values and operators unresolved | `npm.cmd run test:v4-mainnet-readiness` |
| Rollback and incident response | Shipped with bounded limitations | `docs/releases/v4-arc-mainnet-rollback.md`, `v4-arc-mainnet-incident-response.md` | Deterministic fail-closed config | Cannot erase on-chain history | `npm.cmd run rehearse:arc-mainnet-registry` |
| Commercial model | Commercial hypothesis | `docs/business/`, `docs/grant/grant-sustainability.md` | Arithmetic and boundary consistency checked | No live billing, customers, or revenue | `npm.cmd run test:grant-evidence` |
| Whitepaper evidence consistency | Shipped and verified | `docs/whitepaper/` | Version, benchmark, proof, budget, mainnet and claim boundaries checked | Reader document; canonical sources remain authoritative | `npm.cmd run test:whitepaper-consistency` |
| Grant landing and whitepaper assets | Shipped and verified | `apps/web/whitepaper/`, `scripts/lib/v4-grant-landing.mjs` | Semantic landing checks, HTML/PDF/SVG asset checks, responsive browser smoke | V4 landing remains preview-only while the production flag is false | `npm.cmd run test:grant-landing` and `npm.cmd run test:whitepaper-assets` |

## Canonical grant story

**Problem:** Application-level disclosure and privacy-readiness risks in Arc payment, treasury, and private-credit Solidity applications may not be seen consistently before deployment.

**Solution:** VeilForge performs local compiler-backed deterministic analysis, produces verified evidence, integrates with developer/CI workflows, and can anchor a verified report identity on Arc Testnet without uploading source to a remote AI service.

**Current evidence:** working scanner; CLI, SDK, SARIF, GitHub Action and gate; browser worker; verified reports; bounded 60-case benchmark; real Testnet publication; receipt/event verification; duplicate protection; mainnet readiness package; commercial sustainability plan.

**Grant unlocks:** hosted CI; secure account and metering foundations; Team workflows; detector and benchmark expansion; independent security validation; Arc ecosystem integration and onboarding. These are future deliverables, not current product claims.
