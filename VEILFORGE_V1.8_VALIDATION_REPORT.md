# VeilForge v1.8 Validation Report

**Release:** VeilForge v1.8.2 — Privacy Mission Control  
**Validation date:** 2026-07-22  
**Base:** clean `veilforge-v1.1` branch archive; the failed v1.8 monorepo was not patched or reused as the release base.

## Validated environment

- Node.js `v22.16.0`
- npm `10.9.2`
- Chromium `144.0.7559.96`
- npm dependencies: none
- lockfile: npm lockfile v3

## Commands executed

```bash
npm install
npm run build:web
npm run test
npm run typecheck
npm run smoke:browser
```

## Results

| Check | Result |
|---|---|
| npm install | completed; 1 package audited; 0 vulnerabilities |
| static web build | completed; 25 files generated in `dist/` |
| Node test suite | 20 passed, 0 failed |
| static syntax / JSON validation | 46 JavaScript modules and 6 JSON files passed |
| Chromium runtime smoke | passed |
| responsive runtime check | passed at 390 px; no root horizontal overflow |
| release ZIP exporter | deterministic output; archive accepted by `unzip -t` |
| report schema | generated canonical report validated against published schema |
| policy schema | generated Arc Policy Manifest validated against published schema |

## Browser runtime coverage

The Chromium smoke test loads the generated `dist` HTML, CSS, canonical engine, proof module, ZIP module, configuration, demos, and application code. It verifies:

- single-click MetaMask connection request
- account permission before Arc network switching
- automatic connected-wallet session pop-up
- visible three-layer starfield and subtle aurora motion
- primary scan button visual parity with the hero action
- initial vulnerable demo scan
- canonical report hash generation
- `Deployment Blocked` project state
- rendered finding cards
- Exposure Chains view
- Treatment Plan 2.0 view
- local browser history
- Proof Center 2.0 registry configuration
- JSON, Markdown, policy, and remediation ZIP export actions
- vulnerable-to-hardened comparison flow
- hardened `Ready` state
- 390 px responsive layout
- absence of browser runtime exceptions

The execution environment blocks navigation to local HTTP and file URLs through Chromium policy. The smoke script therefore injects the exact generated `dist` assets into a Chromium page through the Chrome DevTools Protocol. It is a real Chromium DOM/runtime test, but not a network-hosted Vercel test.

## Determinism fixtures

### Vulnerable payroll

- status: `Deployment Blocked`
- score: `0`
- findings: `20`
- report hash: `0xe6bf1adafe767d1dd9d65107b4c4e1ab1229cde7ce384c2c7c2f29935bfcde1a`

### Hardened payroll

- status: `Ready`
- score: `100`
- findings: `0`
- report hash: `0x9fcd445bd4bbdbc7c7b6ceff32b91a9abda55f63ca4687e3c1ebc46f4ded732d`

## Proof integration checks

- selector `publishReport(bytes32,bytes32,bytes32,uint16,string,string)` verified as `0x6133eb3a`
- calldata offsets and dynamic strings decoded in the unit test
- argument order verified as `reportURI` followed by `scannerVersion`
- mocked EIP-1193 wallet flow verified in the exact order `eth_requestAccounts` → `eth_chainId`; the connected-session pop-up opens automatically; proof publication still verifies one `eth_sendTransaction`
- reference registry source checked for the same ABI order

## Deliberate limits

- No real wallet transaction was sent during automated validation.
- The existing Arc Testnet registry was not redeployed.
- The reference Solidity registry source was not recompiled because this zero-dependency release does not include a Solidity compiler. The browser encoder, selector, argument order, and mocked transaction path were tested.
- VeilForge is readiness tooling, not a replacement for Solidity compilation, contract tests, manual review, or a security audit.
- Vercel Preview must still be checked before merging a preview branch into `main`.

## Release packaging rules

- `node_modules` is not included.
- generated `dist/` is not included; Vercel creates it with `npm run build:web`.
- the ZIP opens directly to the repository root.
- the release contains fewer than 100 files for a simpler GitHub web upload workflow.
