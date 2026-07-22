# Changelog

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
- Added deterministic exposure chains and Treatment Plan 2.0.
- Added report comparison, local history, Proof Center 2.0, exports, schemas, CLI, examples, and showcase documentation.
- Replaced the fragile dependency graph with a zero-dependency static build.
- Added Node tests, static validation, and Chromium runtime smoke testing.

## v1.1.0 — Remediation Intelligence

- Added deterministic impact and remediation guidance.
- Added selector policy recommendations, executive summary, exports, Solidity upload, and Arc report proof flow.
