# Changelog

## v3.2.2 — Publisher-scoped Registry V2

- Deployed and configured Registry V2 on Arc Testnet.
- Scoped latest reports by `projectId + publisher`.
- Prevented one wallet from overwriting another wallet's record for the same project ID.
- Preserved the existing `publishReport` ABI and selector for browser compatibility.
- Added `getLatestReport(projectId, publisher)`, `getMyLatestReport(projectId)`, and `hasReport(projectId, publisher)`.
- Updated release documentation, tests, build metadata, and the default registry address.

## v3.2.1 — Bytecode Truth network binding

- Added a mandatory `eth_chainId` check before any Bytecode Truth runtime query.
- Rejects non-Arc RPC endpoints before `eth_getCode` or ERC-1967 storage reads.
- Records the verified Arc Testnet chain ID in exported bytecode attestations.
- Added unit and Chromium smoke coverage for RPC validation order.

## v3.2 Ascension update

- Added the source-bound Privacy Deployment Twin and explicit APS roadmap labeling.
- Added Attack Replay Cinema frames to every deterministic evidence campaign.
- Added revisioned deployment lineage, stale-source detection, and locally linked Living Passport evidence.
- Added Arc Deploy Rehearsal checks for network, USDC gas, source gate, intent, lineage, and APS availability.
- Added Privacy CI Gate, `--gate` CLI behavior, GitHub Actions workflow export, and CI evidence bundles.
- Added automatic domain rule packs and deterministic source-guided fuzz plans.
- Expanded browser smoke coverage for all Ascension workspaces and exports.

## v3.2.0 — Privacy Operating System final

- Added No-Code Privacy Intent Studio with source-stable, policy-bound report hashes.
- Anchored Forge candidates to exact source lines and moved `tx.origin` remediation to mandatory engineering review.
- Renamed Shadow Lab claims to source-evidence mapping and clarified Passport gates as source checks.
- Added cross-platform build, local serving, ZIP validation and Chromium discovery.
- Added Privacy Genome with sensitive assets, actors, semantic graph and Disclosure Matrix.
- Added deterministic Privacy Intent YAML and code-to-intent compliance scoring.
- Added Shadow Evidence Lab adversarial campaigns with explicit non-EVM boundary.
- Added Transaction MRI traces.
- Added Forge Mode candidate patch planning and downloadable candidate project bundles.
- Added source-bound Privacy Passport.
- Expanded canonical JSON and ZIP exports with all v3.2 evidence.
- Added v3.2 browser workspaces and responsive layouts.
- Expanded the test suite and Chromium smoke coverage.

## v1.8.15 — Release-state integrity and wallet isolation

- Invalidate stale reports immediately when source files are replaced or cleared.
- Restore matching project labels and source files when opening same-session history entries.
- Prevent historical reports from exporting unrelated current source files after a page reload.
- Isolate inactive wallet-provider events so an old extension cannot overwrite the active wallet session.
- Expanded Chromium smoke coverage for file/report integrity, history restoration, and multi-wallet event isolation.

## v1.8.14 — Confirmed Arc proofs and readable proof UI

- Aligned proof calldata with the deployed registry order: `scannerVersion`, then `reportURI`.
- Added preflight `eth_call` simulation before sending a proof transaction.
- Wait for the Arc transaction receipt and show success only after `status = 1`.
- Failed or timed-out transactions now show an explicit ArcScan link instead of a false Submitted success state.
- Increased comparison and Proof Center microcopy sizes for comfortable reading.
- Added automated tests for successful and reverted mined proof transactions.

## v1.8.13 — Adaptive card density

- Rebalanced Exposure Chain column widths around real content length.
- Improved long-title wrapping and reduced wasted space for short values.
- Preserved responsive single-column layouts and internal scroll behavior.

## v1.8.12 — Comparison overflow and scroll

- Fixed long comparison text overflowing its cards.
- Added internal scrolling to Resolved, Ongoing, and Introduced columns.
- Removed the comparison display cap so the full result set remains browsable.

## v1.8.11 — Scroll parity and export alignment

- Added matching internal scroll behavior to Triage, Exposure Chains, and Treatment Plan lists.
- Aligned all export cards and download actions.

## v1.8.10 — Version badge pulse and filter polish

- Added a soft, eye-friendly pulse animation to the mint dot in the hero version badge.
- Refined severity and policy filters with improved border, focus, hover, and chevron styling.

## v1.8.9 — Intake and wallet modal polish

- Balanced Project Intake spacing and field sizing.
- Reduced wallet chooser and session modal dimensions without sacrificing readability.

## v1.8.8 — Balanced typography

- Reduced finding-row and supporting text sizes by one step for a cleaner dashboard.
- Matched Privacy Readiness and Contract Readiness heading sizes.

## v1.8.7 — Wallet icons and readability

- Added branded fallback icons for Keplr EVM and Phantom.
- Increased wallet chooser, dashboard, and workspace typography.

## v1.8.6 — Canonical wallet names and duplicate cleanup

- Renamed the Keplr EVM provider to `Keplr EVM` in the wallet chooser.
- Canonicalized MetaMask, Phantom, Rabby Wallet, and Zerion labels.
- Deduplicated legacy and EIP-6963 announcements.
- Added direct legacy discovery for `window.keplr.ethereum` and `window.phantom.ethereum`.

## v1.8.5 — Multi-wallet connection behavior

- Stopped opening the Connected Wallet panel automatically after connection.
- Added EIP-6963 discovery with EIP-1193 fallback.
- Added a wallet chooser for multiple installed EVM wallets.
- Passed the selected provider through proof publication.

## v1.8.4 — Arc wallet network correction

- Corrected Arc Testnet chain ID to `5042002` / `0x4CEF52`.
- Corrected native USDC decimals to `18`.
- Added unknown-network handling, explicit switching, and post-switch verification.

## v1.8.0 — Privacy Mission Control

- Replaced duplicate analyzers with one canonical ES-module engine.
- Added multi-file project scans and contract-level triage.
- Added deterministic exposure chains and Treatment Plan 3.2.
- Added report comparison, local history, Proof Center 3.2, exports, schemas, CLI, examples, and showcase documentation.
- Replaced the fragile dependency graph with a zero-dependency static build.
- Added Node tests, static validation, and Chromium runtime smoke testing.

## v1.1.0 — Remediation Intelligence

- Added deterministic impact and remediation guidance.
- Added selector policy recommendations, executive summary, exports, Solidity upload, and Arc report proof flow.
