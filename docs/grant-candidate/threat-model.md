# VeilForge Grant Candidate Threat Model

Status: normative for v4.0.0-gc.1.

## Protected assets

- payer, payee, beneficiary, and supplier identities;
- employee and payroll information;
- payment and settlement amounts;
- invoice, customer, and KYC references;
- loan terms, collateral, and interest rates;
- settlement references; and
- treasury operator identity or authority metadata.

## Adversaries

1. A public-chain observer reading calldata, logs, getters, return data, revert data, and metadata.
2. An unauthorized external caller invoking public interfaces.
3. An untrusted or misconfigured external contract receiving sensitive arguments.
4. An over-privileged treasury operator.
5. A developer who accidentally routes sensitive data to a public sink.
6. A party presenting a report generated from different source, policy, compiler settings, bytecode, or git state.
7. A permissionless Registry V3 issuer who is not trusted by the deployment verifier.

## Trust boundaries

| Boundary | Required control |
|---|---|
| Project files to compiler | Exact compiler version, canonical project-relative paths, complete imports |
| Compiler output to IR | Structured diagnostics, AST/source-location validation, no partial-success claim |
| IR to detector | Versioned source/sink/declassification model |
| Detector to report | Stable finding and occurrence identity, deterministic ordering |
| Report to CI gate | Canonical report and policy hashes, suppression/accepted-risk validation |
| CI to Arc attestation | Source/report/policy/compiler/bytecode/git binding |
| Registry to deployment gate | Chain, contract code, event, revocation, expiry, and issuer allowlist verification |

## In-scope disclosure paths

- storage write or declaration to public getter;
- function argument or storage value to event;
- sensitive data accepted through publicly observable calldata;
- source to return value;
- source to revert string or custom-error argument;
- source to an external call argument;
- source to metadata, memo, or URI material; and
- supported intra-function, inherited, internal-call, and bounded cross-contract flows.

## Out of scope for the Grant Candidate

- off-chain storage and operational security;
- wallet compromise and private-key custody;
- global transaction-graph deanonymization;
- cryptographic primitive verification;
- economic correctness, creditworthiness, or regulatory compliance;
- unsupported compiler versions; and
- unsupported assembly/Yul semantics beyond explicit incomplete-analysis reporting.

## Safety rule

Unknown behavior is not safe behavior. If VeilForge cannot establish a complete supported analysis, the result is `analysis-incomplete`, `compile-error`, or `unsupported-compiler`, never `pass`.
