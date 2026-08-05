# V4 proof and registry model

Status: Phase 5C-1 off-chain core. This model prepares transactions but does not connect a wallet, call an RPC endpoint, submit a transaction, or deploy a contract.

## Compatibility decision

The deployed `VeilForgeReportRegistry` V2 contract on Arc Testnet is sufficient for V4 report anchoring. Its `bytes32 reportHash` stores the canonical schema 4.1.0 / `veilforge.report.hash.v2` report digest without changing that digest. Its publisher-scoped record and event retain the project anchor, source-manifest anchor, publisher, block timestamp, scanner/version token, and transaction identity. Consequently Phase 5C-1 does not change or deploy the contract.

The V2 ABI's `score` field is a legacy compatibility field. V4 preflight writes the neutral value `0`, identified off-chain as `legacy-abi-neutral`; it is not a security, readiness, or policy-gate score. The scanner string carries a bounded version token containing the product, report, hash-payload, and proof versions. The canonical report hash remains the authoritative binding.

## Envelope

`veilforge.proof.v4.1` is a deterministic, source-free envelope. It binds:

- schema 4.1.0 and hash payload `veilforge.report.hash.v2`;
- the verified report hash and source-manifest digest;
- project, domain, finding, completeness, policy, compiler, and analyzer summaries;
- Arc chain, trusted registry address, and registry contract version.

`createdAtOperational` and `transactionIdentity` are excluded from `canonicalPayloadDigest`. They cannot alter the report or envelope payload identity. Unknown envelope fields are rejected. Source, AST, IR, provider, signer, RPC URL, and secret-bearing keys are rejected.

Incomplete but integrity-verified reports may produce an envelope only with `complete=false` and at least one canonical reason code. No passing gate or security claim is synthesized.

## Verification and preflight

Proof creation recomputes report integrity and validates the schema/version pair, hash payload, source locations, exact compiler `0.8.24`, analyzer identity, completeness, policy, and finding-disposition counts. A client-provided `integrity.verified=true` is never trusted by itself.

The trusted network configuration is versioned and currently enables only Arc Testnet (`5042002`) and Registry V2 at `0x88B4055eaB061CEa9BdfefF524f65ff461B5401d`. Chain or registry mismatch, an unsupported network, zero/invalid address, or missing signer fails closed. User-supplied RPC endpoints and arbitrary registry addresses are not executed or accepted.

`prepareRegistryPublish` returns serializable calldata only. It never invokes a provider. A matching existing record produces `already-published` with no transaction request; a conflicting record fails closed. The contract can detect current publisher/project records, while historic transaction identity requires an indexed receipt supplied by the consumer.

## Receipt and persistence

Receipt normalization validates successful status, chain, trusted log address, the deployed `ReportPublished` ABI, report/project/source hashes, scanner version, and publisher. Its output is a chain-aware transaction identity and a fixed-base ArcScan URL.

V4 persistence uses `veilforge:v4:proof:<chain>:<registry>:<reportHash>`. Only verified envelopes are stored or loaded. The legacy `veilforge:v3:` namespace is neither migrated nor rewritten. Provider and signer objects are never persisted.

## Phase 5C-2 adapter boundary

The web layer can consume four pure values: a verified V4 report, its verified envelope, a preflight result containing an optional transaction request, and a normalized receipt containing a trusted explorer link. Pending/published/failed UI state remains operational and outside the canonical proof digest.

## Known boundary

Phase 5C-1 performs no live RPC acceptance. Contract bytecode, live duplicate reads, wallet simulation, transaction submission, and Arc Testnet confirmation belong to Phase 5C-2. A live consumer must obtain the existing record and receipt from a trusted provider before passing them to these pure verification helpers.
