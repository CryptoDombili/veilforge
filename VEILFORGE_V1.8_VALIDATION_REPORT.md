# VeilForge v1.8 Corrected Preview Validation Report

**Release:** VeilForge v1.8 — Classic UI usability correction  
**Validation date:** 2026-07-22

## Corrected issues

- Header wallet connect control and connected-wallet popup restored.
- Animated starfield moved to a visible stacking layer behind the interface.
- Triage findings list constrained to a 620 px desktop / 540 px mobile scroll area.

## Commands executed

```bash
npm install
npm run build:web
npm run test
npm run typecheck
npm run smoke:browser
```

## Results

- npm install: completed; 1 package audited; 0 vulnerabilities.
- Static web build: completed; 25 files generated in `dist/`.
- Node test suite: 20 passed, 0 failed.
- Static JavaScript and JSON validation: 46 JavaScript modules and 6 JSON files passed.
- Chromium runtime smoke: passed.
- Browser assertions: visible animated starfield, bounded findings scroll area, wallet connection and popup passed.
- Responsive check: passed at 390 px with no root horizontal overflow.

## Scope limits

- No real wallet transaction was submitted during validation.
- Wallet behavior was tested with a mock EIP-1193 provider in Chromium.
- The reference registry contract was not redeployed.
