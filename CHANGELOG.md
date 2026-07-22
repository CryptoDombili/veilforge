## VeilForge v1.8.7
- Added branded fallback icons for Keplr EVM and Phantom in the wallet chooser.
- Increased wallet chooser, dashboard and workspace typography for better readability.
- Preserved multi-wallet EIP-6963 discovery and direct session behavior.

# Changelog

## v1.8.6 — Canonical wallet names and duplicate cleanup

- Renamed the Keplr EVM provider to `Keplr EVM` in the wallet chooser.
- Canonicalized the preferred wallet labels as MetaMask, Phantom, Rabby Wallet and Zerion.
- Deduplicated legacy and EIP-6963 announcements so Rabby appears only once.
- Preferred the richer EIP-6963 candidate with the official wallet icon over generic legacy provider rows.
- Added direct legacy discovery for `window.keplr.ethereum` and `window.phantom.ethereum`.

## v1.8.5 — Multi-wallet connection behavior

- Stopped opening the Connected Wallet session panel automatically after a successful connection.
- The connected address button now opens the session panel only when the user clicks it.
- Added EIP-6963 multi-provider discovery with legacy EIP-1193 injected-wallet fallback.
- Added an installed-wallet chooser when multiple EVM browser wallets are available.
- Added generic wallet messages and passed the selected provider into proof publication.

## v1.8.4 — Arc wallet network correction

- Corrected Arc Testnet chain ID hex to `0x4cef52` (decimal `5042002`).
- Corrected native USDC gas-token decimals to `18`.
- Added nested MetaMask error-code handling for unknown networks.
- Explicitly switches to Arc Testnet after adding the network and verifies the selected chain before opening the wallet session.

## 1.8.0 — Privacy Mission Control

- replaced duplicate web/standalone analyzers with one canonical ES-module engine
- added multi-file project scans and contract-level triage
- added deterministic exposure chains
- added Treatment Plan 2.0 with P0–P3 priorities
- added report comparison and local scan history
- added Proof Center 2.0 with dependency-free ABI encoding
- corrected registry argument order to `reportURI`, then `scannerVersion`
- added Arc Policy Manifest and remediation ZIP exports
- added custom-rule API, CLI, schemas, examples, and showcase documentation
- replaced the fragile Vite/Vitest dependency graph with a zero-dependency static build
- added Node tests, static validation, and Chromium CDP runtime smoke testing

## 1.1.0 — Remediation Intelligence

- deterministic impact and remediation guidance
- selector policy recommendations
- executive summary and exports
- Solidity file upload and Arc report proof flow
