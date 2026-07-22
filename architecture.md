# Analyzer Engine

## Public API

Import from:

```js
import {
  scanProject,
  compareReports,
  generatePolicyManifest,
  formatMarkdownReport,
  formatTextReport,
  canonicalSourceHash,
  canonicalReportHash,
  parseSolidityFile,
  functionSelector,
} from './packages/analyzer/src/index.js';
```

## `scanProject(files, options)`

Input:

```js
[
  { path: 'contracts/Payroll.sol', content: 'pragma solidity ...' },
  { path: 'contracts/Settlement.sol', content: 'pragma solidity ...' },
]
```

Options:

```js
{ customRules: [] }
```

Output includes:

- project score, grade, and status
- severity totals
- contract-level scores and statuses
- findings
- selector policies
- exposure chains
- Treatment Plan 2.0
- normalized file metadata
- canonical source and report hashes

## Canonical hashing

VeilForge includes a pure JavaScript Keccak-256 implementation with known-vector tests. It is shared by Node and browser runtimes.

- function selectors use the first four bytes of Keccak-256 of the canonical signature
- source hash uses normalized sorted source bundles
- report hash uses canonical key-sorted report serialization
- project ID is derived from the canonical source hash

## Reuse patterns

### Browser

Copy or serve `packages/analyzer/src/` as ES modules and import `index.js`.

### Node

Use the modules directly from Node 20+ or call the CLI.

### CI

```bash
node packages/analyzer/cli.mjs scan contracts --format json --output veilforge-report.json
```

A CI job can fail when:

```js
if (report.status === 'Deployment Blocked') process.exit(1);
```

### Custom product

Builders can fork only the analyzer, use the report schema, and render a different UI without changing deterministic output.
