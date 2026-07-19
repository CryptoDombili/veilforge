# Architecture

VeilForge has four independent layers:

1. **Scanner** — parses Solidity and executes deterministic rules.
2. **Policy model** — recommends `Open`, `Restricted`, or `Locked` for externally callable selectors.
3. **Remediation intelligence** — maps each finding to impact, policy guidance, and an adaptable safer pattern.
4. **Proof registry** — optionally anchors source and report fingerprints on Arc Testnet without publishing source code.

The browser application runs analysis locally. The canonical report excludes UI state and timestamps so identical normalized inputs produce identical fingerprints.
