# Security Policy

## Supported release

The current reviewer-facing product is **VeilForge V4 Grant Candidate**. The latest published GitHub release is [`v4.0.0-gc.2`](https://github.com/CryptoDombili/veilforge/releases/tag/v4.0.0-gc.2); current `main` can contain later, unreleased hardening. V4 retains `4.0.0-gc.1` as its compatibility-bound engine identity so existing reports and proofs remain verifiable. Canonical V4 reports use schema `4.1.0` and hash payload `veilforge.report.hash.v2`.

The root npm package and repository-safe default web build remain `3.2.2` for legacy compatibility. That value is not the current public product or GitHub release identity. See [`docs/RELEASE_STATUS.md`](docs/RELEASE_STATUS.md) for the canonical version and deployment matrix.

Supported security boundaries for the V4 candidate are exact `solc@0.8.24` with `tmp@0.2.7`, Arc Testnet Registry V2 proof publication only, and Arc mainnet `enabled=false`, `proofReadEnabled=false`, and `publishEnabled=false`.

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

The active Arc Testnet registry is `0x88B4055eaB061CEa9BdfefF524f65ff461B5401d`. Latest reports are keyed by `projectId + publisher`, so one wallet cannot overwrite another wallet's record. The write ABI remains compatible with prior VeilForge clients.
