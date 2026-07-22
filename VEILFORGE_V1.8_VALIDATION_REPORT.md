# VeilForge v1.8.5 Validation Report

**Release:** VeilForge v1.8.5 — Multi-wallet session behavior  
**Validation date:** 2026-07-22  
**Base:** VeilForge v1.8.4 validated Arc wallet build

## Scope of this revision

- Do not open the Connected Wallet session panel automatically after connection.
- Open the session panel only when the user clicks the connected address button.
- Discover multiple installed EVM browser wallets through EIP-6963.
- Retain legacy EIP-1193 / `window.ethereum` fallback.
- Present a wallet chooser only when more than one compatible injected provider is available.
- Pass the selected provider through Arc proof publication instead of falling back to a different injected wallet.
- Keep the existing VeilForge visual design, starfield, scanner, analyzer, export and proof layout unchanged.

## Supported wallet scope

This release supports installed browser-extension EVM wallets that expose an EIP-1193 provider, including providers discovered through EIP-6963. The browser smoke test models Rabby and Zerion simultaneously and proves that only the wallet selected by the user receives requests. WalletConnect / QR-based mobile sessions are not included because they require a separate relay integration and project configuration.

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
| Dependency installation | Completed; zero external runtime dependencies; 0 vulnerabilities |
| Static web build | Completed; canonical engine and proof modules copied into `dist/` |
| Node test suite | 22 passed, 0 failed |
| Static JavaScript / JSON validation | 46 JavaScript modules and 6 JSON files passed |
| Chromium runtime smoke | Passed |
| 390 px responsive smoke | Passed; no root horizontal overflow |
| Multi-provider discovery | Rabby and Zerion discovered through EIP-6963 |
| Wallet selection | Rabby selected; Zerion received zero provider requests |
| Connection request order | `eth_requestAccounts` → `eth_chainId` |
| Arc network add/switch | Correct chain ID `0x4CEF52`, USDC 18 decimals, final chain verified |
| Automatic session panel | Confirmed closed after connection |
| Connected address action | Confirmed session panel opens after user clicks the connected address |
| Selected provider publication | Selected provider passed to proof publication |
| Existing scanner behavior | 20 findings rendered; bounded scroll area retained |

## Important limitation

A real third-party browser extension cannot be controlled from the isolated validation environment. Runtime validation uses EIP-1193-compatible mock providers through the same EIP-6963 event path used by extension wallets. Final preview testing should still be performed with the user’s installed wallets before merging to `main`.
