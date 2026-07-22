# Arc Open Source Showcase submission

## Short description

VeilForge v1.8 is a local and deterministic pre-APS Privacy Mission Control for Solidity projects targeting Arc. It maps disclosure risks to exact source lines, traces observed exposure paths, generates prioritized remediation and Arc-aligned selector policies, and can anchor canonical report fingerprints on Arc Testnet without publishing source code.

## Technical description

VeilForge's reusable TypeScript engine parses multi-file Solidity projects and runs explainable deterministic rules. The same engine powers the browser workspace, CLI, JSON and Markdown reports, Arc Policy Manifest, Remediation Pack and proof fingerprints. Builders can import the scanner, add project-specific deterministic rules, compare scans, create deployment gates and reuse the Arc registry integration.

## Reusable components

- canonical source normalization and Keccak-256 hashing
- Solidity AST parser pipeline
- built-in privacy detection rules
- custom deterministic rule API
- contract and project triage
- exposure-chain builder
- selector policy generator
- Treatment Plan 2.0
- report comparison
- JSON and Markdown report formatters
- Arc Policy Manifest generator
- Arc Testnet report registry contract and ABI

## How builders can build on VeilForge

- add privacy readiness to a Solidity IDE
- create a CI deployment blocker
- build a project-specific rule pack
- visualize policy boundaries in a governance tool
- generate audit evidence packs
- anchor report versions on Arc
- compare privacy remediation across releases

## Links

- GitHub: `https://github.com/CryptoDombili/veilforge`
- Live app: `https://veilforge-web.vercel.app`
- Registry: `https://testnet.arcscan.app/address/0xf8b1D03931f2c11B642259d9aB19cfA3351C0Bbc`

## Presentation note

The preferred presentation is a pre-recorded English demo with subtitles and professional voice-over. Questions can be answered in written Discord chat.

## Scope note

Arc's published documentation currently lists APS as roadmap functionality that is not yet available. VeilForge is readiness infrastructure: it does not claim live APS execution or official Circle affiliation.
