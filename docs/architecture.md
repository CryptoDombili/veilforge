# VeilForge v1.8 architecture

VeilForge uses one canonical analyzer package. Every interface consumes the same report shape and hashing functions.

```mermaid
flowchart LR
    A[Solidity source bundle] --> B[Path and line-ending normalization]
    B --> C[Solidity AST parser]
    C --> D[Built-in deterministic rules]
    B --> E[Optional custom deterministic rules]
    D --> F[Canonical findings]
    E --> F
    C --> G[Selector policy recommendations]
    C --> H[Contract summaries]
    F --> H
    F --> I[Project triage]
    C --> J[Observed exposure chains]
    F --> J
    G --> J
    F --> K[Treatment Plan 2.0]
    B --> L[Canonical source hash]
    F --> M[Canonical report object]
    G --> M
    H --> M
    I --> M
    J --> M
    K --> M
    L --> M
    M --> N[Canonical report hash]
    M --> O[Web Mission Control]
    M --> P[CLI]
    M --> Q[Markdown and JSON exports]
    M --> R[Arc Policy Manifest]
    N --> S[Arc Testnet registry proof]
```

## Workspaces

### `packages/scanner`

The canonical engine. It owns parsing, built-in rules, custom-rule execution, score calculation, contract triage, exposure chains, treatment plans, comparison, report formatting and hashing.

### `apps/web`

The browser interface. It imports `@veilforge/scanner`; it does not implement a second scanner. Source is analyzed in the browser process.

### `packages/shared`

Arc Testnet constants and the registry ABI shared by the web app and integrations.

### `contracts`

The `VeilForgeReportRegistry` Hardhat workspace.

### `schemas`

Machine-readable contracts for canonical report and Arc Policy Manifest exports.

## Canonicality

The source hash normalizes path separators and line endings, sorts source files by path and hashes the resulting bundle with Keccak-256.

The report hash canonicalizes object keys and stable array ordering before Keccak-256. The `reportHash` field itself is excluded from the hashed payload.

The scanner version is part of the report hash. A rule change should increment the scanner version.

## Why the legacy standalone scanner was retired

Before v1.8, `standalone/app.js` contained a separate browser ruleset and used SHA-256. That made cross-interface report equality impossible. v1.8 replaces it with a notice and uses the TypeScript package everywhere.
