# Arc Open Source Showcase — VeilForge v3.2

## Project

**VeilForge v3.2 — Privacy Operating System**

VeilForge is a local-first privacy engineering workbench for Solidity projects on Arc. It maps sensitive assets and disclosure boundaries, compiles an inferred privacy intent, reproduces source-evidence attack paths, creates Transaction MRI traces, prepares deterministic candidate hardening edits and generates a source-bound Privacy Passport.

## Why it matters for Arc

Arc is built for programmable financial applications where access boundaries, sensitive payment data, operator permissions and deployment assurance matter. VeilForge gives builders a reproducible pre-deployment workflow without sending confidential source code to a remote AI service.

## Main modules

1. Privacy Genome
2. Disclosure Matrix
3. Privacy Intent Compiler
4. Shadow Evidence Lab
5. Transaction MRI
6. Forge Mode
7. Privacy Passport
8. Arc Policy Manifest
9. Arc Testnet proof publication

## Trust model

- source remains local
- no AI API
- deterministic canonical report
- exact source evidence
- source-bound hashes
- explicit wallet confirmation
- candidate patches are never mislabeled as deploy-ready

## Demo flow

1. Run the vulnerable payroll project.
2. Show Privacy Genome and Disclosure Matrix.
3. Show policy violations in Intent.
4. Replay an evidence campaign in Shadow Lab.
5. Follow the disclosure in Transaction MRI.
6. Review Forge candidates and manual-review boundaries.
7. Compare with the hardened project.
8. Show the source-bound Privacy Passport.
9. Publish the canonical report proof on Arc Testnet.

## Release boundary

`3.2.0-preview.1` performs deterministic source-evidence replay. It does not claim full arbitrary EVM execution or formal verification. Forge output requires compilation, regression tests and review before deployment.

## Short announcement

> VeilForge v3.2 is now a Privacy Operating System for Solidity on Arc: Privacy Genome, Disclosure Matrix, Intent Compliance, Shadow Evidence Lab, Transaction MRI, deterministic Forge candidates, source-bound Privacy Passport and hash-only Arc proofs. Source stays local. No AI API.
