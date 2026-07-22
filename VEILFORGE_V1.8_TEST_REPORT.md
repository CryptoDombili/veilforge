# VeilForge v1.8 validation report

Release candidate: **VeilForge v1.8.0 — Privacy Mission Control**

## Completed checks

| Check | Result |
|---|---|
| Zero-dependency release preflight | **Passed — 37/37** |
| TypeScript/TSX syntax transpilation | **Passed — 42 files, 0 diagnostics** |
| Scanner core semantic typecheck | **Passed** |
| Scanner CLI semantic typecheck with dependency declarations | **Passed** |
| Web source semantic typecheck with dependency declarations | **Passed** |
| Mission Control logic assertions | **Passed** |
| Deterministic ZIP writer archive test | **Passed** |
| Repository JSON parsing | **Passed — 0 invalid files** |
| Registry ABI/client argument-order consistency | **Passed** |
| Package/version consistency | **Passed — all workspaces 1.8.0** |
| Secret/release hygiene preflight | **Passed** |

## Logic exercised

The dependency-independent logic test covered:

- severity totals, score, grade and triage state
- contract summaries
- project triage
- storage → function → event → selector → policy exposure chains
- P0–P3 Treatment Plan ordering
- Arc Policy Manifest generation
- scan comparison and resolved findings
- project-specific custom deterministic rules

## Integrity fixes verified

- The legacy duplicate standalone scanner is retired.
- The web proof client uses the registry's exact `score → reportURI → scannerVersion` order.
- Source/report fingerprints use the canonical scanner path.
- Reports contain an immutable analysis profile with local execution, no AI API, Keccak-256 and the exact built-in/custom rule IDs.
- The deployed registry address is consistent across shared constants and deployment metadata.
- The current app points to the current Arc documentation domain.

## Environment limitation

A full dependency-backed execution of `npm run check` could not be completed in this workspace because the npm registry was unreachable/timed out. Therefore the following still need to run in GitHub/Vercel or a normal connected local environment:

- actual `npm install`
- Vitest suites
- Vite production build
- Hardhat compile and contract tests
- browser interaction test against the deployed site

This limitation is stated explicitly: no claim is made that the dependency-backed production build ran inside this workspace. The release includes `npm run preflight`, the full test files, Vercel configuration and the production verification checklist.

## Production acceptance checklist

After GitHub upload and Vercel deployment:

1. Confirm Vercel completes `npm run build:web`.
2. Open all seven Mission Control tabs.
3. Switch Vulnerable → Hardened and review Progress.
4. Upload a real `.sol` bundle.
5. Download JSON, Markdown, policy and Remediation Pack ZIP outputs.
6. Confirm source/report hashes change with source changes.
7. Use only a burner/test wallet for Arc Testnet proof publication.
8. Confirm the transaction on ArcScan.

See `DEPLOY_v1.8.md` and `UPLOAD_TO_GITHUB.md`.
