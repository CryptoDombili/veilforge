# VeilForge Release Status

This is the canonical human-readable status for grant and security reviewers. Historical phase, rollout and RC documents are evidence records; when they conflict with this page, this page describes the current repository boundary.

## Identity matrix

| Identity | Current value | Meaning |
|---|---|---|
| Product | VeilForge V4 Grant Candidate | Current reviewer-facing product |
| Latest published GitHub release | `v4.0.0-gc.2` | Latest non-draft, non-prerelease release, published from commit `be33ec62a0a0799f4100cc9d2ecd592e53f2bc12` |
| Current source | `arc-mainnet-production-candidate` | Audited Arc Mainnet production-candidate branch; use `git rev-parse HEAD` for the exact checkout under review |
| V4 engine compatibility identity | `4.0.0-gc.1` | Preserved in existing V4 reports/proofs; not silently renamed by maintenance packaging |
| Root package / source-default build | `3.2.2` | Legacy CLI/report and fail-closed V3 web compatibility; not the V4 public release identity |
| Report schema | `4.1.0` | Canonical V4 report schema |
| Hash payload | `veilforge.report.hash.v2` | Canonical V4 report hash domain |
| Compiler | exact `solc@0.8.24` | Node and browser compiler identity |

No future tag or release is claimed by this document.

## Web deployment and build boundary

- The source default is `WEB_V4_ENABLED=false`. A plain `npm run build:web` therefore produces the legacy-compatible V3.2.2 build.
- The checked-in `dist/` is that source-default compatibility artifact. It is not the canonical V4 reviewer artifact.
- `npm run build:grant-release` remains the generic V4 reviewer-artifact command. It verifies the release manifest first, explicitly enables V4, cleans `dist-grant-release/`, builds, and fails closed unless product, schema, hash-payload and network identities match.
- The canonical Arc Mainnet production command is `npm run build:arc-mainnet-production`; `npm run verify:arc-mainnet-production` verifies its trusted source snapshot and generated artifact.
- The production Vercel configuration uses `npm run build:arc-mainnet-production` and `dist-mainnet-production`, explicitly enabling the V4 presentation and selecting the verified `arc-mainnet` profile. The presentation flag and network trust gates remain independent.

## Network and proof boundary

- The official production runtime is `arc-mainnet`, chain ID `5042` (`0x13b2`), using Registry V2 at `0x43D76BfCa31eAd660C5d804FEe20d14C0c577337`.
- Current status is `deploymentStatus=verified`, `enabled=true`, `proofReadEnabled=true`, and `publishEnabled=true`.
- The verified deployment transaction is `0x2ad90b2d3c1343295cffbd770ae584bc6f086c0010aabc985ad1af1f8644789f`.
- The first controlled Mainnet proof transaction is `0xc546c684ccc4a04ae2466926972a3c20d53c8b4616022f03240f4319d3de1693`; receipt, event, Registry readback, and duplicate-send guard evidence were reconciled.
- Arc Testnet Registry V2 proof publishing and read-only receipt/event reconciliation remain documented as historical milestone evidence, not the current production network identity.
- Registry V2 is an immutable deployed contract with publisher-scoped records and latest-record overwrite semantics. “Immutable” describes the deployed bytecode contract, not an assurance that hosting, wallets, RPC services or evidence are trustless.
- Mainnet publication remains guarded and explicit: the application does not request private keys, automatically sign, automatically retry, or bypass chain, registry, evidence, and duplicate-send checks.
- Circle Wallets and Circle Contracts integrations are roadmap work, not implemented product claims.

## CI and browser validation

- `.github/workflows/v4-gc-release-gate.yml` is the canonical pull-request and `main` source gate. It runs manifest/specification checks, locked dependency audit, external Action consumer, deterministic browser runtime, benchmark/release gate, proof/security boundaries, grant evidence and full preflight. Preflight includes a real Chromium DevTools smoke test.
- `.github/workflows/v4-web-cross-browser-acceptance.yml` runs the real canonical grant-release artifact in Chromium, Firefox and WebKit for pull requests to `main`; adds Edge/Windows for pushes to `main`; and preserves the full four-browser matrix plus release regression for `v4.*` tags and manual dispatches.
- Repository YAML supplies an objective release-time path, but GitHub repository settings must require the successful workflow before a release is published. YAML alone cannot enforce that administrative policy.
- Phase 3 PR/main CI passed on GitHub-hosted Ubuntu with the Chromium smoke. The full four-browser workflow for the current source must not be called passed until its GitHub-hosted run succeeds.

## Reproducibility and dependency boundary

- `RELEASE_MANIFEST.sha256` hashes release sources with normalized text line endings and byte-exact binary hashes; clone/worktree Git metadata and generated output directories are excluded.
- `releaseManifestDigest` identifies the manifest bytes used by a report or generated artifact. It does not prove that trusted CI verified those bytes. Trust comes from independently running the documented verification command in a controlled checkout.
- Exact `solc@0.8.24` is retained. npm overrides its transitive `tmp` dependency to `0.2.7`; the compatibility path and release tests are validated, and `npm audit` is a mandatory gate.

## Bounded claims

The maintained benchmark contains 60 oracle cases and records 60/60 passed, 56 true positives, 0 false positives and 0 false negatives, with 0 nondeterministic results. Those numbers apply only to that maintained corpus. VeilForge is not an audit, formal verification, universal correctness result or confidentiality guarantee.
