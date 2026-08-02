# VeilForge v3.2 Architecture

## Design goals

1. local source processing
2. deterministic and reproducible output
3. one canonical analyzer for web, CLI and exports
4. explicit security boundaries
5. source-bound privacy evidence
6. zero runtime package dependencies
7. reusable modules for Arc builders

## Canonical analyzer

`packages/analyzer/src/` contains the parser, rule playbook, policy generator, exposure-chain engine, report builder, comparison logic, canonical serialization and Keccak-256 implementation.

The v3.2 preview adds:

- `genome.js` — sensitive assets, actors, Disclosure Matrix and semantic graph
- `intent.js` — inferred Privacy Intent YAML and compliance violations
- `attack.js` — Shadow Evidence campaigns and Transaction MRI traces
- `forge.js` — deterministic candidate patch planning and candidate application
- `passport.js` — source-bound Privacy Passport

The browser and CLI import the same modules. No alternate browser-only rule set exists.

## Data flow

```text
Normalized Solidity files
        ↓
Lexical Solidity parser
        ↓
Rules + selector policies + exposure chains
        ↓
Privacy Genome
        ↓
Privacy Intent + Shadow Evidence + Transaction MRI
        ↓
Forge Plan + Privacy Passport
        ↓
Canonical report hash
        ↓
Web / CLI / exports / optional Arc proof
```

## Determinism

The source hash sorts normalized paths and joins each file with stable separators. The report hash uses recursively key-sorted JSON. No timestamp, random value, browser state, wallet state or network response enters the canonical report.

Finding fingerprints and graph IDs are stable hashes of source-derived identity fields.

## Parser boundary

The preview uses an inspectable lexical Solidity parser rather than a dependency-heavy compiler package. It recognizes contracts, interfaces, libraries, state variables, events, functions, visibility, modifiers, parameters, returns and balanced blocks.

It is not `solc`. Unsupported or malformed source creates `VF000` and blocks trustworthy analysis.

## Shadow Evidence boundary

Shadow Evidence Lab maps deterministic source findings into adversarial campaigns. It does not execute arbitrary bytecode or claim full EVM equivalence in this preview.

## Forge boundary

Forge Mode only applies narrow string-preserving candidate transformations when the exact evidence is available. Every candidate is marked for compilation and regression testing. Unsafe transformations remain manual.

## Build pipeline

`npm run build:web`:

1. removes the previous `dist/`
2. copies browser files
3. copies canonical analyzer modules
4. copies proof modules and rewrites the build-relative Keccak import
5. copies demo fixtures
6. injects the validated registry address and build version
7. writes a build manifest
8. verifies required output files

## Runtime security

- no source upload endpoint
- no analytics SDK
- no remote JavaScript or CSS
- local history can be cleared
- downloads are generated in memory
- proof publication requires wallet confirmation
- private keys remain inside the wallet
