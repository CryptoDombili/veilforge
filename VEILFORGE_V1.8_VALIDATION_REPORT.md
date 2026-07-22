# VeilForge v1.8.7 Validation Report

**Release:** VeilForge v1.8.7 — Readable UI and branded wallet icons  
**Validation date:** 2026-07-22  
**Base:** VeilForge v1.8.6 validated wallet chooser build

## Scope of this revision

- Add branded fallback icons for **Keplr EVM** and **Phantom** inside the wallet chooser when wallet metadata does not provide a usable icon.
- Preserve the existing wallet chooser order and behavior: Keplr EVM, MetaMask, Phantom, Rabby Wallet, Zerion.
- Increase typography sizes across the wallet modal, wallet chooser, scanner workspace and key dashboard surfaces so the UI is easier to read on desktop and mobile.
- Keep the existing Arc Testnet session behavior, manual session popup, EIP-6963 discovery and responsive scanner layout intact.

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
| Wallet chooser icons | Keplr EVM and Phantom now render branded fallback icons when no announced icon is available |
| Wallet chooser order | Preserved: Keplr EVM, MetaMask, Phantom, Rabby Wallet, Zerion |
| Readability update | Larger typography applied to wallet chooser, wallet session popup, feature cards, workspace headers, filters and finding rows |
| Mobile responsive smoke | Passed at 390 px; no root horizontal overflow |
| Preflight | Completed successfully |

## Important limitation

The isolated browser validation uses EIP-1193 mock providers announced through the same EIP-6963 event flow used by browser extensions. Final preview testing should still be performed with the user's installed extensions before merging to `main`.
