<p align="center">
  <img src="assets/social-preview.png" alt="VeilForge — deterministic privacy readiness for Solidity" width="100%" />
</p>

<h1 align="center">VeilForge v1.8</h1>
<p align="center"><strong>Privacy Mission Control for Solidity projects targeting Arc.</strong></p>
<p align="center">Local analysis · Deterministic output · No AI API · Arc-ready policy and proof artifacts</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-63f6c7.svg"></a>
  <img alt="Version" src="https://img.shields.io/badge/version-1.8.0-62c9ff">
  <img alt="Solidity" src="https://img.shields.io/badge/Solidity-0.8.24-363636?logo=solidity">
  <img alt="Arc Testnet" src="https://img.shields.io/badge/Arc-Testnet-66f4c6">
  <img alt="AI" src="https://img.shields.io/badge/AI%20API-none-6cf4d2">
</p>

## Live product

- **Application:** [veilforge-web.vercel.app](https://veilforge-web.vercel.app)
- **Arc Testnet registry:** [`0xf8b1D03931f2c11B642259d9aB19cfA3351C0Bbc`](https://testnet.arcscan.app/address/0xf8b1D03931f2c11B642259d9aB19cfA3351C0Bbc)
- **First report transaction:** [ArcScan](https://testnet.arcscan.app/tx/0x3270d43b814d4083aee3f97377495ff2866d58a43b792d41c5b04beb8d693d4d)
- **Live-app publication:** [ArcScan](https://testnet.arcscan.app/tx/0xa3585453549b60d71819df0e4c32d341687e7cf50836cce26e7add7830f5e1a1)
- **v1.1 demo video:** [YouTube](https://youtu.be/NMbUYhL427s)

> [!IMPORTANT]
> VeilForge is an independent community project. It is not an official Circle product and it is not a formal security audit. The project is pre-APS readiness tooling based on Arc's published privacy design. Arc's official documentation currently describes APS as roadmap functionality that is not yet available; VeilForge does not execute private transactions or claim live APS integration.

## What changed in v1.8

v1.1 acted like a privacy specialist: it found disclosure risks, explained impact and suggested deterministic remediation.

v1.8 turns that specialist into **Privacy Mission Control**:

- project-level triage with `ready`, `review-required`, `high-risk` and `deployment-blocked` states
- contract-by-contract readiness and risk ordering
- deterministic exposure chains across storage, functions, events, selectors and policy boundaries
- prioritized Treatment Plan 2.0 with P0–P3 actions
- scan comparison and local metadata-only history
- Arc Policy Manifest export
- deterministic Remediation Pack ZIP export
- Proof Center 2.0 with the deployed Arc Testnet registry configured by default
- one canonical engine for the web app, CLI, exports and report fingerprints
- reusable public API and custom deterministic rule support
- complete architecture, integration and contribution documentation
- redesigned privacy-focused Mission Control interface with reduced-motion support

## Why VeilForge exists

A Solidity system can expose sensitive financial, identity or operational data before a privacy layer is added. Common surfaces include:

- public state getters and public mappings
- unguarded sensitive read and write functions
- event schemas and runtime event values
- plaintext dynamic calldata
- verbose revert messages
- low-level calls and cross-contract value movement
- unrestricted administrative selectors
- ambiguous authorization such as `tx.origin`

VeilForge converts these surfaces into an explainable workflow:

```text
Solidity project
      ↓
Canonical AST parser + deterministic rules
      ↓
Project triage + contract readiness
      ↓
Exact source-line findings
      ↓
Observed exposure chains
      ↓
Prioritized treatment plan
      ↓
Open / Restricted / Locked policy manifest
      ↓
Canonical source + report hashes
      ↓
Optional Arc Testnet proof
```

## Trust model

VeilForge deliberately does **not** use an AI model inside the product.

- source code stays in the browser or local CLI process
- no Solidity code is sent to an AI API or analysis service
- the same normalized input and rule version produce the same output
- findings are tied to rule IDs, exact source locations and evidence
- report fingerprints use canonical Keccak-256 hashing
- every report records the exact built-in and custom rule IDs executed
- local scan history stores metadata only, not source code
- on-chain proofs store hashes and report metadata, never Solidity source

See [`docs/privacy-model.md`](docs/privacy-model.md) and [`docs/threat-model.md`](docs/threat-model.md).

## 60-second reviewer walkthrough

1. Open the live app.
2. Review **Mission overview** and the deployment decision.
3. Switch between the vulnerable and hardened payroll demos.
4. Open **Source & findings** to inspect exact evidence lines.
5. Open **Exposure chains** and follow a storage → function → selector → policy path.
6. Open **Treatment plan** to see P0–P3 remediation order.
7. Open **Progress** on the hardened demo to view resolved findings and score change.
8. Export JSON, Markdown, Arc Policy Manifest and Remediation Pack ZIP.
9. Open **Proof center** to preview or publish the canonical report fingerprint on Arc Testnet.

## Quick start

### Requirements

- Node.js 20+
- npm 10+

### Windows

Double-click:

```text
run-demo.bat
```

### macOS / Linux

```bash
./run-demo.sh
```

### Manual setup

```bash
git clone https://github.com/CryptoDombili/veilforge.git
cd veilforge
npm install
npm run preflight
npm run check
npm run dev
```

The terminal prints the Vite development URL.

## Canonical scanner API

The reusable engine is in [`packages/scanner`](packages/scanner).

```ts
import {
  analyzeProject,
  scanSources,
  generatePolicyManifest,
  compareReports,
  type SourceFile,
} from '@veilforge/scanner';

const files: SourceFile[] = [
  {
    path: 'Payroll.sol',
    content: soliditySource,
  },
];

const report = analyzeProject(files);
const manifest = generatePolicyManifest(report);

console.log(report.triage.status);
console.log(report.contracts);
console.log(report.exposureChains);
console.log(report.treatmentPlan);
console.log(manifest.selectors);
```

### Compare two scans

```ts
const before = scanSources(vulnerableFiles);
const after = scanSources(hardenedFiles);
const progress = compareReports(before, after);

console.log(progress.scoreDelta);
console.log(progress.resolvedFindings);
console.log(progress.introducedFindings);
```

### Add a custom deterministic rule

```ts
import { scanSources, type CustomDetectionRule } from '@veilforge/scanner';

const customRule: CustomDetectionRule = {
  id: 'VF_CUSTOM_MEMO',
  title: 'Sensitive memo emitted in an event',
  description: 'A project-specific memo field is written to a public event.',
  severity: 'high',
  category: 'event-disclosure',
  confidence: 'high',
  impact: 'The memo becomes permanent, indexable public metadata.',
  remediation: 'Emit a commitment or non-sensitive status instead of the memo.',
  suggestedPolicy: 'Locked',
  matches: ({ line }) => /emit\s+\w+\([^;]*memo/i.test(line),
};

const report = scanSources(files, { customRules: [customRule] });
```

Custom rule IDs must match `VF_[A-Z0-9_]{3,64}`. See [`examples/custom-detection-rule`](examples/custom-detection-rule).

## CLI

```bash
npm run build -w @veilforge/scanner
node packages/scanner/dist/cli.js scan examples/vulnerable-payroll/Payroll.sol
node packages/scanner/dist/cli.js scan examples --format json --output veilforge-report.json
node packages/scanner/dist/cli.js scan examples --format markdown --project-name "Payroll demo" --output report.md
node packages/scanner/dist/cli.js scan examples --format policy --output arc-policy.json
node packages/scanner/dist/cli.js scan contracts --fail-on high
```

Supported formats are `text`, `json`, `markdown`, `policy` and `treatment`. Exit code `1` is used when `--fail-on` is met. Exit code `3` indicates scanner failure.

## Detection rules

VeilForge includes twelve built-in deterministic rules plus the parse-integrity rule `VF000`.

| Rule | Primary severity | Detects |
|---|---:|---|
| `VF000` | Critical | Source that cannot be parsed completely |
| `VF001` | Critical | Sensitive public state with automatic getters |
| `VF002` | High | Sensitive event schemas |
| `VF003` | Medium | Secret-bearing revert text |
| `VF004` | High | Unguarded sensitive read selectors |
| `VF005` | High / Medium | Unguarded sensitive state-changing selectors |
| `VF006` | Critical / Medium | Low-level and delegate-style calls |
| `VF007` | Medium | Sensitive values crossing contract boundaries |
| `VF008` | Critical / High | Public mappings and indexed-record exposure |
| `VF009` | Critical | Unrestricted administrative mutation |
| `VF010` | Critical | `tx.origin` authorization |
| `VF011` | High | Sensitive runtime values emitted in events |
| `VF012` | High | Sensitive plaintext in dynamic calldata |

See [`docs/detection-rules.md`](docs/detection-rules.md).

## Transparent scoring and triage

| Severity | Penalty |
|---|---:|
| Critical | −25 |
| High | −15 |
| Medium | −8 |
| Low | −3 |

The score is clamped to 0–100.

| Triage state | Deterministic condition |
|---|---|
| `deployment-blocked` | At least one critical finding |
| `high-risk` | High finding exists or score is below 70 |
| `review-required` | Medium/low finding exists or score is below 90 |
| `ready` | No deterministic rule matched |

This is a prioritization signal, not a deployment guarantee.

## Export formats

The web interface exports:

- canonical JSON report
- Markdown Mission Control report
- Arc Policy Manifest JSON
- deterministic Remediation Pack ZIP
- proof receipt JSON

The ZIP includes the report, treatment plan, exposure chains, policy manifest, proof payload and the source files selected locally by the user.

Schemas:

- [`schemas/report.schema.json`](schemas/report.schema.json)
- [`schemas/policy-manifest.schema.json`](schemas/policy-manifest.schema.json)

## Arc proof registry

[`contracts/contracts/VeilForgeReportRegistry.sol`](contracts/contracts/VeilForgeReportRegistry.sol) stores:

- project ID
- source hash
- report hash
- readiness score
- optional report URI
- submitter
- timestamp
- scanner version

It does not store source code or the finding payload.

```text
Chain ID: 5042002
RPC: https://rpc.testnet.arc.network
Explorer: https://testnet.arcscan.app
Registry: 0xf8b1D03931f2c11B642259d9aB19cfA3351C0Bbc
```

The app uses this deployed registry by default. `VITE_REGISTRY_ADDRESS` can override it for another deployment.

See [`docs/arc-proof-registry.md`](docs/arc-proof-registry.md).

## Repository architecture

```text
veilforge/
├── apps/web/                 React Privacy Mission Control
├── packages/scanner/        Canonical analyzer and public API
├── packages/shared/         Arc network constants and registry ABI
├── contracts/               Hardhat registry contract and tests
├── schemas/                 Report and policy JSON schemas
├── examples/                Integration and custom-rule examples
├── docs/                    Architecture and developer documentation
├── standalone/              Notice replacing the retired duplicate engine
├── LICENSE
├── CONTRIBUTING.md
└── vercel.json
```

The old standalone rule subset was intentionally retired in v1.8. It used a separate rule implementation and SHA-256 fingerprints. Keeping it would allow identical source to produce different reports. The canonical web application and CLI now share `packages/scanner` and Keccak-256 hashing.

## Documentation

- [Architecture](docs/architecture.md)
- [Analyzer engine](docs/analyzer-engine.md)
- [Detection rules](docs/detection-rules.md)
- [Exposure chains](docs/exposure-chains.md)
- [Policy manifest](docs/policy-manifest.md)
- [Report schema](docs/report-schema.md)
- [Arc proof registry](docs/arc-proof-registry.md)
- [Privacy model](docs/privacy-model.md)
- [Threat model](docs/threat-model.md)
- [Integration guide](docs/integration-guide.md)
- [Showcase submission](docs/showcase-submission.md)
- [Demo script](docs/demo-script.md)
- [Security policy](SECURITY.md)

## Current limitations

- VeilForge is not a compiler, formal verifier or full security auditor.
- Semantic-name rules are heuristics and are labelled with confidence.
- Exposure chains represent observed source relationships, not runtime taint analysis.
- Import resolution and inherited behavior are limited by the parser view of supplied files.
- Dynamic dispatch, assembly and generated code require manual review.
- A `ready` result means no current deterministic rule matched; it does not prove privacy.
- Arc's official documentation currently lists APS as roadmap functionality that is not yet available. Policy recommendations are forward-looking readiness guidance, not executable live APS configuration.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md). Contributions should add explainable deterministic behavior, source evidence and tests. AI-generated or probabilistic runtime findings are outside the product scope.

## License

MIT. See [`LICENSE`](LICENSE).
