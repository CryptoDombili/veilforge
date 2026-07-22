# Security policy

## Supported release

Security fixes are accepted for the current `1.8.x` line.

## Reporting a vulnerability

Do not publish a working exploit, private key, wallet seed, confidential Solidity source or unredacted user data in a public issue.

Use GitHub's private vulnerability reporting feature for the repository when available. Include:

- affected version and component
- minimal reproduction steps
- expected and observed behavior
- impact assessment
- a safe proof of concept with secrets removed

The maintainers will acknowledge a complete report, reproduce it, prepare a deterministic fix and publish release notes. No response-time or bounty guarantee is implied.

## Product boundary

VeilForge is pre-APS privacy-readiness tooling, not a formal audit or proof of security. A `ready` result only means no current deterministic rule matched the supplied sources.
