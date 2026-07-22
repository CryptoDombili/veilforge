# Security Policy

## Scope

VeilForge is privacy-readiness tooling, not a formal smart-contract audit. Reports are prioritization signals and must not replace manual review, compiler checks, tests, audits, or operational controls.

## Reporting a vulnerability

Do not publish an exploitable issue or user secret in a public GitHub issue. Contact the repository owner privately through the contact method listed on the GitHub profile and include:

- affected version and file
- reproduction steps
- impact
- suggested remediation, when known

Do not include seed phrases, private keys, production credentials, or private source code that you are not authorized to share.

## Trust boundaries

- Solidity analysis runs locally.
- Browser history is stored in localStorage on the current device.
- Exported ZIP files may contain the source files selected by the user.
- Arc proof publication is optional and stores hashes and metadata only.
- The app relies on the connected EIP-1193 wallet to display and approve transactions.
- Registry addresses and Arc network configuration must be verified before publication.

## Supported version

Security fixes target the latest tagged release. Historical demos may remain available for comparison but are not supported deployment branches.
