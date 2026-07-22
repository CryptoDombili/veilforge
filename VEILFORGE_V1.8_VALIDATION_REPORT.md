# VeilForge v1.8.14 Validation Report

**Release:** VeilForge v1.8.14 — Privacy Mission Control  
**Validation date:** 2026-07-22  
**Runtime:** Node.js 22.16.0, npm 10.9.2, Chromium CDP smoke runtime

## Automated validation

| Check | Result |
|---|---|
| `npm install` | Completed; 0 vulnerabilities |
| Static web build | Passed; 25 files generated in `dist/` |
| Node test suite | **23 passed, 0 failed** |
| Static JavaScript and JSON validation | Passed; 46 JavaScript modules and 6 JSON files |
| Chromium runtime smoke | Passed |
| Responsive smoke | Passed at 390 px with no root horizontal overflow |
| Release source manifest | Passed; SHA-256 manifest matches current source files |

## Functional coverage

- Deterministic repeat scans and canonical report hashes
- Vulnerable, remediated, and multi-contract examples
- Contract-level triage and selector policy generation
- Exposure Chains and P0–P3 Treatment Plan generation
- Resolved, Ongoing, and Introduced comparison states
- Canonical JSON, Markdown, Arc Policy Manifest, and deterministic remediation ZIP exports
- EIP-6963 wallet discovery with EIP-1193 fallback
- Arc Testnet add/switch verification
- Proof calldata encoding using deployed `scannerVersion`, then `reportURI` order
- Pre-transaction `eth_call` simulation
- Receipt confirmation and reverted-transaction rejection
- Report and policy schema validation

## Manual preview checks

The preview build was exercised with uploaded Solidity files, comparison baselines, exports, multiple wallet providers, Arc Testnet switching, and Proof Center publication. A `publishReport` transaction was confirmed successfully on Arc Testnet:

```text
0x969534cc42f7c57e5c202f0abc65bcaef2f43a12ef24dcca454f334d9ef64d3a
```

## Security and trust boundaries

- No Solidity source is sent to an AI API or remote analyzer.
- No private key, seed phrase, `.env` file, or production credential is included in the repository.
- Only selected hashes and metadata are published by the optional Arc proof flow.
- VeilForge is readiness tooling, not a replacement for a formal security audit.
