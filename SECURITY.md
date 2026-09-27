# Security Policy

## Supported release

The current reviewer-facing product is **VeilForge V4 Grant Candidate**. The latest published GitHub release is [`v4.0.0-gc.2`](https://github.com/CryptoDombili/veilforge/releases/tag/v4.0.0-gc.2); current `main` can contain later, unreleased hardening. V4 retains `4.0.0-gc.1` as its compatibility-bound engine identity so existing reports and proofs remain verifiable. Canonical V4 reports use schema `4.1.0` and hash payload `veilforge.report.hash.v2`.

The root npm package and repository-safe default web build remain `3.2.2` for legacy compatibility. That value is not the current public product or GitHub release identity. See [`docs/RELEASE_STATUS.md`](docs/RELEASE_STATUS.md) for the canonical version and deployment matrix.

Supported security boundaries for the V4 candidate are exact `solc@0.8.24` with `tmp@0.2.7` and trusted, network-aware Registry V2 proof publication. The official production profile is verified Arc Mainnet: network key `arc-mainnet`, chain ID `5042` (`0x13b2`), registry `0x43D76BfCa31eAd660C5d804FEe20d14C0c577337`, `deploymentStatus=verified`, `enabled=true`, `proofReadEnabled=true`, and `publishEnabled=true`. These flags permit guarded runtime operations; they do not bypass chain, registry, evidence, duplicate-send, or explicit wallet-approval checks.

## Reporting

Report suspected vulnerabilities through a private GitHub security advisory when possible. Do not publish exploitable details before a fix is available.

## Product boundaries

VeilForge is an engineering aid, not a formal audit, compiler, symbolic prover or full EVM emulator.

- V4 produces compiler-backed, source-to-sink evidence for supported constructs and reports incomplete analysis explicitly.
- The maintained 60-case benchmark is bounded evidence, not a universal false-positive or false-negative claim.
- Candidate projects must still be compiled, tested, independently reviewed and audited as appropriate.
- Arc proof publication stores canonical hashes and metadata, never Solidity source.
- The application never requests private keys and does not automatically send a transaction.

## Publisher-scoped Registry V2

The current production Arc Mainnet registry is `0x43D76BfCa31eAd660C5d804FEe20d14C0c577337`. Its verified deployment transaction is `0x2ad90b2d3c1343295cffbd770ae584bc6f086c0010aabc985ad1af1f8644789f`; the first controlled Mainnet proof transaction is `0xc546c684ccc4a04ae2466926972a3c20d53c8b4616022f03240f4319d3de1693`.

Latest reports are keyed by `projectId + publisher`, so one wallet cannot overwrite another wallet's record. The write ABI remains compatible with prior VeilForge clients. Publication requires an explicit wallet action; VeilForge never requests a private key or seed phrase and does not automatically sign or send transactions.

The Arc Testnet registry `0x88B4055eaB061CEa9BdfefF524f65ff461B5401d` and its documented transactions remain historical milestone evidence, not the current production identity.
