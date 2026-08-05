# VeilForge V4 Grant Candidate — Executive Summary

Status: final grant evidence package. This document does not claim Circle or Arc endorsement, grant approval, customers, revenue, or mainnet deployment.

## One-sentence pitch

VeilForge helps Arc payment, treasury, and private-credit builders find application-level Solidity disclosure risks before deployment through local compiler-backed analysis, verified reports, CI integration, and optional Arc Testnet proof anchoring.

## 100-word summary

VeilForge is a local-first privacy-readiness scanner for Solidity applications built around Arc Payments, Arc Treasury, and Arc Private Credit workflows. It compiles projects with exact Solidity 0.8.24, constructs AST, IR, control-flow, call-graph, and dataflow evidence, and produces deterministic schema 4.1.0 reports. The V4 Grant Candidate supports CLI, SDK, SARIF, GitHub Action, policy gates, browser workers, verified exports, and Arc Testnet proof anchoring. Its maintained 60-case oracle passes 60/60 with 56 true positives, zero false positives, and zero false negatives. This bounded result is not universal correctness, an audit, formal verification, or a confidentiality guarantee for reviewed pre-deployment financial application workflows.

## 250-word summary

Financial Solidity applications can disclose payment, treasury, or private-credit information through public storage, getters, events, return values, external calls, metadata, revert paths, and calldata. These application-level risks can remain hard to review consistently before deployment, especially for small teams without dedicated security staff.

VeilForge V4 addresses this problem with compiler-backed, deterministic analysis that keeps source code local. Exact Solidity 0.8.24 compilation feeds a stable AST index, intermediate representation, control-flow graphs, call graph, and intraprocedural/interprocedural dataflow. Domain detector packs produce source-backed findings, traces, dispositions, incomplete-analysis reasons, and a verified report using schema 4.1.0 and `veilforge.report.hash.v2`. The same evidence contract supports the SDK, worker-isolated CLI, SARIF 2.1.0, GitHub Action, policy gate, browser runtime, exports, and proof envelope.

The maintained oracle contains 60 positive, negative, and adversarial cases across Arc Payments, Arc Treasury, and Arc Private Credit. The current candidate passes 60/60 with 56 TP, 0 FP, 0 FN, negative FP 0, release gate `passed / allow`, and nondeterminism 0. This result is bounded to that corpus and does not replace an audit or formal verification.

A real Arc Testnet `publishReport` transaction was receipt- and event-verified against Registry V2, including publisher, registry, and report-hash identity. Duplicate reconciliation prevents a second send for the same publisher-scoped identity. Mainnet deployment remains NO-GO while official network values, independent review, operational ownership, and fee validation are unresolved. Grant funding would accelerate hosted CI, secure account/metering foundations, team workflows, detector/corpus expansion, independent security validation, and Arc developer onboarding while keeping the open local core free under documented release limits.

## 500-word technical summary

VeilForge V4 is a compiler-backed privacy-readiness analysis pipeline for Solidity projects. Its current domain scope is Arc Payments, Arc Treasury, and Arc Private Credit. The problem is narrower than general smart-contract security: application-level financial data can be disclosed through language and protocol surfaces even when a contract behaves as designed. Public state, compiler-generated getters, events, return values, external-call arguments, metadata, reverts, and calldata all require consistent source-to-sink reasoning before deployment.

The candidate compiles deterministic standard JSON input with exact `solc 0.8.24`. Compilation output is indexed into a stable AST model and lowered into a versioned intermediate representation. Per-callable control-flow graphs and a resolved call graph feed budgeted intraprocedural and interprocedural dataflow. Sources, sinks, provenance, policy declassification, accepted risk, confidence, incomplete-analysis states, occurrence grouping, evidence, traces, and remediation guidance are represented explicitly. Unsupported or unresolved behavior fails closed as unsupported or incomplete rather than being silently treated as safe.

Canonical output uses report schema `4.1.0` and hash payload `veilforge.report.hash.v2`; legacy schema 4.0.0/hash v1 verification remains isolated. Operational timestamps, wallet state, and network responses do not enter the canonical report identity. JSON, Markdown, export manifests, and SARIF 2.1.0 are integrity-checked. The ESM SDK exposes one-call and staged APIs. The CLI provides worker isolation, safe path handling, abort/timeout behavior, atomic output, verification commands, and stable exit codes. The GitHub Action runs the CLI with read-only repository permissions and exposes SARIF and allow/deny gate results. The browser runtime uses a pinned compiler artifact in an isolated worker, enforces a 1 MiB project limit, and keeps the production feature flag false by default.

The release benchmark is a fixed 60-case oracle: 20 cases per domain, including positive, negative, and adversarial fixtures. The current result is 60/60 case-level passes, 56 TP, 0 FP, 0 FN, negative FP 0, no unsafe locations, release gate `passed / allow`, and nondeterminism 0. This is evidence for the maintained corpus only. It is not proof of correctness for arbitrary Solidity, a replacement for an audit or formal verification, or a confidentiality guarantee.

Proof anchoring binds a verified V4 report envelope to trusted Arc network metadata. A real Arc Testnet transaction, `0xdb674c986195ed9b3950f34d058637fbb2b887f58ca724400225ba177884192c`, published the canonical report hash through Registry V2. Receipt, event, publisher, registry, block, and report hash were reconciled read-only. Publisher-scoped duplicate lookup returns `already-published`, leaves `transactionRequest=null`, and blocks a second transaction. The observed `0.001175966 USDC` fee is historical Testnet evidence, not a mainnet estimate.

Mainnet controls are fail-closed: `enabled=false`, `proofReadEnabled=false`, and `publishEnabled=false`, with official network identity and deployment values unresolved. Registry V2 is compatible with operational limitations but still requires independent review and controlled deployment rehearsal. Commercially, the open/local Community core remains free. Developer, Team, and Enterprise offerings are roadmap hypotheses centered on managed CI, private repositories, hosted history, collaboration, support, and private deployment. No paid plan, billing system, customer, partnership, or revenue is claimed live. The grant evidence package links each shipped claim to repository paths and reproduction commands, separates roadmap and commercial hypotheses, and keeps browser, registry, and mainnet limitations visible for independent review.

## Why now

Arc-focused financial applications are moving from prototypes toward repeatable payment, treasury, and credit workflows, while security review capacity remains scarce. Compiler-backed local analysis can shift evidence gathering earlier into development and CI, reducing review friction without asking teams to upload sensitive source code. VeilForge already has an integrated scanner, evidence formats, browser runtime, CI boundary, bounded benchmark, and real Testnet proof, so the next risk is operationalization rather than inventing an untested product category.

## Why Arc

Arc provides a focused environment for payments and financial applications, including USDC-denominated fee evidence on Testnet. VeilForge’s maintained detector domains—Arc Payments, Arc Treasury, and Arc Private Credit—map directly to those developer workflows. Testnet Registry V2 publication demonstrates that deterministic off-chain analysis can be linked to a public verification identity while source remains local. This is technical and product alignment, not an endorsement claim.

## Sustainability

The open scanner core, CLI, basic SDK, local browser workflow, public detector packs, and portable report verification remain free. Revenue is hypothesized from managed private CI, hosted history, team governance, private runners/deployment, and support. Current prices and month-12 scenarios are planning assumptions, not offers or forecasts. Grant funding would be used to measure hosted costs, validate demand and tenant boundaries, expand Arc workflows, and build a sustainable managed layer without removing independent local verification.
