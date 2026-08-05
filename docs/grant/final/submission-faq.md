# Grant Submission FAQ

## What problem are you solving?

Arc payment, treasury, and private-credit Solidity applications can disclose financial data through public storage, getters, events, returns, external calls, metadata, reverts, or calldata. Small teams need reproducible evidence before deployment without sending source to a remote analysis service.

## Why Arc?

VeilForge’s three maintained domains map to Arc financial application workflows, and Arc Testnet supports a real proof-publication demonstration. This is product alignment, not endorsement.

## Why now?

The technical foundation—compiler-backed analysis, verified reports, CLI/SDK/CI, browser runtime, bounded benchmark, and Testnet proof—already exists. The next leverage point is safe operationalization, onboarding, independent validation, and evidence-driven hosted workflows.

## What is technically novel?

VeilForge combines local exact-compiler analysis, source-to-sink provenance, explicit incomplete states, deterministic evidence/report identities, CI gating, and publisher-scoped on-chain proof reconciliation for Arc financial disclosure workflows. Novelty is claimed as this integrated workflow, not as a new compiler or proof of universal correctness.

## What is live today?

The V4 analyzer, domain packs, SDK, CLI, SARIF, GitHub Action, policy gate, verified reports/exports, browser worker/runtime, proof envelope, Testnet Registry V2 publication, receipt/event verification, duplicate protection, and readiness/runbook documents are implemented and tested within documented limits.

## What is not live?

Production-default V4 web rollout, Arc mainnet deployment/publishing, accounts, billing, paid plans, hosted CI service, team workspaces, SSO, SLA, private runners, and production card/USDC subscriptions are not live.

## How is privacy preserved?

Source compilation and analysis are local-first; the browser uses an isolated worker and the CLI runs locally. Source is not sent to an AI API. Canonical reports exclude operational wallet/network state. Reports still contain potentially sensitive evidence and must be handled accordingly.

## What does the benchmark prove?

It proves exact agreement with the maintained 60-case oracle under the current toolchain: 60/60, 56 TP, 0 FP, 0 FN, negative FP 0, gate passed/allow, nondeterminism 0. It does not prove performance on arbitrary code.

## Why is this not an audit?

The corpus and semantic model are bounded, some constructs produce incomplete analysis, and protocol/business correctness requires human context. VeilForge supplies reproducible evidence; auditors and engineers still make security decisions.

## Who pays?

The hypothesis is that individuals and teams pay for managed private CI, hosted history, collaboration/governance, private deployment, onboarding, and support. No paying customer or conversion is currently claimed.

## What remains free?

The open/local scanner core, CLI, basic SDK, local browser workflow, public detector packs, basic verified exports, report verification, and Community use remain free.

## How will grant funds be used?

35% product engineering, 15% hosted CI infrastructure, 15% security validation, 10% documentation/onboarding, 15% Arc integrations, and 10% developer support/operations.

## How will VeilForge sustain itself?

The plan is to keep local verification free while charging, after validation, for managed operation, collaboration, private infrastructure, and support. Costs, willingness to pay, conversion, churn, and support burden must be measured; current scenarios are hypotheses.

## What are the main risks?

Corpus gaps, audit-tool confusion, browser compatibility, sensitive hosted data, tenant isolation, infrastructure cost, free-to-paid conversion, pricing mismatch, enterprise sales cycles, and unresolved mainnet operations.

## What happens if mainnet details change?

Mainnet config remains untrusted and disabled until official values are independently verified. A versioned config/manifest update, read-only validation, deployment review, staged rollout, and rollback drill are required. Testnet identities are never reused as mainnet identities.

## Why should Circle/Arc fund this?

Funding can convert a working Arc-relevant developer tool into a safer, measured, independently validated workflow for payments, treasury, and private-credit builders while preserving free local verification. The requested work has concrete acceptance evidence and transparent limitations; funding does not imply endorsement or guaranteed adoption.

