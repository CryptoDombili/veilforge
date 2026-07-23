# Arc Open Source Showcase — VeilForge v1.8

## Project

**VeilForge v1.8 — Privacy Mission Control**

VeilForge is a local-first, deterministic privacy-readiness workbench for Solidity projects targeting Arc. It helps builders identify disclosure paths before deployment, plan remediations, produce selector-level policy recommendations, and anchor report hashes on Arc Testnet.

## Why it matters for Arc builders

Privacy is not only a feature added at deployment time. Contract storage, getters, events, calldata, selectors, and cross-contract calls can all create disclosure paths. VeilForge turns those paths into an inspectable engineering workflow:

```text
Storage → Function → Event → Selector → Policy
```

The project does not upload source code to an AI service. Analysis happens locally and identical source bundles produce identical canonical hashes and findings.

## Reusable open-source components

- deterministic analyzer engine
- lexical Solidity project parser
- built-in privacy detection rule playbook
- custom-rule interface
- selector extraction and policy recommendation generator
- deterministic exposure-chain generator
- project and contract readiness scoring
- P0–P3 Treatment Plan generator
- scan-comparison engine
- canonical source and report hashing
- JSON and Markdown report generators
- Arc Policy Manifest generator and schema
- report JSON schema
- CLI and programmatic examples
- dependency-free deterministic ZIP exporter
- EIP-1193 Arc wallet integration
- Arc Report Registry ABI encoder and reference contract

## Demo flow

1. Open Privacy Mission Control.
2. Load the vulnerable payroll demo.
3. Review the project triage, contract score, disclosure findings, and exposure chains.
4. Open Treatment Plan 2.0 and inspect P0–P3 actions.
5. Compare the vulnerable baseline with the hardened payroll example.
6. Export the report, policy manifest, or remediation pack.
7. Open Proof Center 2.0 and publish only project, source, and report hashes to Arc Testnet.
8. Load the multi-contract example to demonstrate project-level triage.

## Trust and safety boundaries

- No AI API
- No remote source-code upload
- No private-key collection
- No claim that a deterministic readiness scan replaces an audit
- Only hashes and selected metadata are published onchain
- Semantic detection is clearly labeled as heuristic where applicable

## Technical profile

- Browser-native JavaScript modules
- Node.js CLI and validation scripts
- No npm runtime or development dependencies
- Canonical Keccak-256 hashing
- Static Vercel deployment
- Arc Testnet EIP-1193 integration
- MIT licensed

## Suggested showcase description

> VeilForge v1.8 is an open-source Privacy Mission Control for Solidity projects on Arc. It performs deterministic local analysis, maps disclosure chains from storage to selector policy, generates remediation plans and reusable manifests, and anchors only report hashes on Arc Testnet. The analyzer, rules, hashing, policy generator, schemas, CLI, custom-rule interface, and proof integration are designed for other builders to fork and import.

## Suggested short post

> VeilForge v1.8 — Privacy Mission Control is now an open-source, project-level privacy engineering workbench for Arc. Multi-file triage, deterministic exposure chains, P0–P3 treatment plans, scan comparison, policy manifests, reusable analyzer modules, and hash-only Arc proofs. No AI API. Source stays local.
