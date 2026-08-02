# Security Policy

## Supported release

The actively validated release is `3.2.2`.

## Reporting

Report suspected vulnerabilities through a private GitHub security advisory when possible. Do not publish exploitable details before a fix is available.

## Product boundaries

VeilForge is an engineering aid, not a formal audit, compiler, symbolic prover or full EVM emulator.

- Shadow Evidence Lab reproduces deterministic source-evidence paths in this release.
- Forge Mode produces candidate edits, not deploy-ready assurances.
- Candidate projects must be compiled, tested and reviewed.
- Privacy Passports are bound to source hashes; deployment lineage is not yet verified.
- Arc proof publication stores canonical hashes and metadata, never Solidity source.
- VeilForge never requests private keys.

## Publisher-scoped Registry V2

The active Arc Testnet registry is `0x88B4055eaB061CEa9BdfefF524f65ff461B5401d`. Latest reports are keyed by `projectId + publisher`, so one wallet cannot overwrite another wallet's record. The write ABI remains compatible with prior VeilForge clients.
