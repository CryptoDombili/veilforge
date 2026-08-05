# Known Limitations and Claim Boundaries

1. **Bounded benchmark.** The 60/60 and 56 TP / 0 FP / 0 FN result applies only to the maintained 60-case oracle. False positives and false negatives remain possible outside it.
2. **Not an audit.** VeilForge is not a substitute for an independent smart-contract audit, formal verification, protocol review, legal analysis, or human engineering review.
3. **No confidentiality guarantee.** A clean scan or on-chain proof does not certify confidentiality, security, correctness, or regulatory compliance.
4. **Exact compiler baseline.** The candidate supports exact `solc 0.8.24`. Other versions can be rejected or require separate validated support.
5. **Browser project limit.** The V4 browser scanner is bounded to 1 MiB total project input, with additional file-count and per-file limits.
6. **Incomplete analysis exists.** Inline assembly, unresolved imports/aliases, recursion, dynamic function pointers, unknown external behavior/returns, low-level calls, compiler-specific builtins, and budget exhaustion can produce explicit incomplete states.
7. **Browser support is bounded.** Chromium and WebKit have local acceptance evidence. Local Edge/Firefox execution remained blocked by environment/tooling and requires clean-CI confirmation. The production V4 feature flag remains false.
8. **Reports are sensitive.** Source is processed locally, but verified reports, findings, paths, traces, exports, and local history can contain sensitive engineering evidence.
9. **Testnet only.** The canonical proof transaction is Arc Testnet evidence. No mainnet deployment, registry address, transaction, or production publishing is claimed.
10. **Mainnet unresolved.** Official chain/RPC/explorer/fee data, independent review, deployment rehearsal, named operational ownership, monitoring, and fee validation remain pending.
11. **Registry V2 operational limitations.** The public contract is immutable and has no admin, pause, upgrade, moderation, revocation, or protocol-wide recovery. Any address can publish its own record.
12. **Publisher-scoped overwrite semantics.** A publisher can replace its latest project-scoped record. Client-side reconciliation and duplicate protection are required; contract-level duplicate immutability is not claimed.
13. **Irreversible public evidence.** Rollback cannot remove contracts, transactions, events, records, fees, or leaked public-chain history.
14. **Paid plans are not live.** Developer, Team, and Enterprise packages, hosted CI, accounts, billing, roles, SSO, SLA, and production payment support are roadmap/hypothesis items.
15. **No production billing.** Card and USDC subscription support require compliance and production validation and are not implemented.
16. **No commercial proof claimed.** Customer profiles, conversion, churn, MRR, Enterprise pilots, and annualized run rates are planning assumptions, not current customers or revenue.
17. **No ecosystem endorsement.** Technical alignment with Arc/Circle workflows does not imply endorsement, partnership, funding, or guaranteed adoption.
18. **No grant guarantee.** This evidence package supports a submission; it cannot predict approval or award probability.

Canonical technical boundaries: `docs/releases/v4.0.0-rc1-known-limitations.md`, `docs/releases/v4-web-browser-support.md`, and `docs/releases/v4-arc-mainnet-readiness.md`.

