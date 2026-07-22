# VeilForge v1.8.6 Validation Report

**Release:** VeilForge v1.8.6 — Canonical EVM wallet chooser  
**Validation date:** 2026-07-22  
**Base:** VeilForge v1.8.5 validated multi-wallet build

## Scope of this revision

- Display Keplr's EVM provider as `Keplr EVM`.
- Keep MetaMask and Phantom as EVM wallet choices.
- Show one canonical `Rabby Wallet` row even when Rabby is discovered through both EIP-6963 and legacy injection.
- Show `Zerion` when the Zerion EIP-1193 provider is actually announced by the installed extension.
- Prefer EIP-6963 metadata and wallet icons over generic legacy provider rows.
- Keep the existing connection, Arc Testnet, manual session popup, scanner and visual behavior unchanged.

## Wallet chooser behavior

The chooser canonicalizes recognized installed providers in this order:

1. Keplr EVM
2. MetaMask
3. Phantom
4. Rabby Wallet
5. Zerion

Unknown compatible EIP-1193 wallets remain supported and are listed after the recognized wallets. A wallet is never relabeled as a different provider: Zerion appears only when a Zerion provider is actually discovered.

## Commands executed

```bash
npm install
npm run build:web
npm run test
npm run typecheck
npm run smoke:browser
npm run preflight
```

## Results

| Check | Result |
|---|---|
| Dependency installation | Completed; zero external dependencies; 0 vulnerabilities |
| Static web build | Completed; 25 files generated in `dist/` |
| Node test suite | 22 passed, 0 failed |
| Static JavaScript / JSON validation | 46 JavaScript modules and 6 JSON files passed |
| Chromium runtime smoke | Passed |
| Wallet labels | Exact order verified: Keplr EVM, MetaMask, Phantom, Rabby Wallet, Zerion |
| Duplicate Rabby cleanup | Legacy Rabby and EIP-6963 Rabby collapsed to one `Rabby Wallet` row |
| Zerion selection isolation | Zerion selected; all four unselected provider logs remained empty |
| Mobile responsive smoke | Passed at 390 px; no root horizontal overflow |

## Important limitation

The isolated browser validation uses EIP-1193 mock providers announced through the same EIP-6963 event flow used by browser extensions. Final preview testing should still be performed with the user's installed wallet extensions before merging to `main`.
