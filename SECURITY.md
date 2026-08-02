# Security Policy

## Supported release

The actively validated release is `3.2.0-preview.1`.

## Reporting

Report suspected vulnerabilities through a private GitHub security advisory when possible. Do not publish exploitable details before a fix is available.

## Product boundaries

VeilForge is an engineering aid, not a formal audit, compiler, symbolic prover or full EVM emulator.

- Shadow Evidence Lab reproduces deterministic source-evidence paths in this preview.
- Forge Mode produces candidate edits, not deploy-ready assurances.
- Candidate projects must be compiled, tested and reviewed.
- Privacy Passports are bound to source hashes; deployment lineage is not yet verified.
- Arc proof publication stores canonical hashes and metadata, never Solidity source.
- VeilForge never requests private keys.
