# VeilForge v4.0.0-gc.1 Product Boundary

Status: normative for Grant Candidate phase 1.

VeilForge Grant Candidate analyzes application-level financial-data disclosure in Solidity projects intended for Arc Payments, Arc Treasury, and Arc Private Credit use cases.

## Supported claim

Given a complete project bundle compiled with exact `solc 0.8.24`, a declared policy, and supported Solidity constructs, VeilForge is intended to trace declared or inferred financial data from sources to these public sinks:

- public storage and compiler-generated getters;
- events;
- public or external calldata;
- public or external return values;
- revert data and custom errors;
- external calls; and
- metadata or URI outputs.

The Grant Candidate is not implemented until the relevant acceptance gates in `acceptance-criteria.md` pass. The existing v3.2.2 analyzer remains a legacy regex- and name-assisted prototype.

## Explicit non-claims

VeilForge:

- does not replace a security audit;
- does not perform formal verification;
- is not a native Arc privacy feature;
- does not claim that Arc makes application data confidential;
- does not analyze off-chain databases, browser telemetry, RPC-provider observation, user devices, or organizational controls;
- does not prove cryptographic safety merely because code calls `keccak256` or uses names such as `hash`, `encrypt`, `private`, or `commitment`;
- does not guarantee absence of undiscovered disclosure; and
- cannot block arbitrary deployments unless the deployer, CI workflow, or factory explicitly integrates the VeilForge gate.

## Supported financial domains

### Arc Payments

Payer, payee, beneficiary, supplier, amount, invoice reference, customer/KYC reference, and settlement reference flows.

### Arc Treasury

Treasury operator, supplier, beneficiary, employee/payroll, amount, invoice reference, and settlement reference flows.

### Arc Private Credit

Customer/KYC reference, loan terms, collateral, interest rate, beneficiary, and repayment or settlement reference flows.

## Fail-closed boundary

Unsupported compiler versions, compiler errors, unresolved imports, ambiguous normalized paths, and analysis-limiting constructs must produce an explicit incomplete or unsupported result. They must never be represented as a clean scan.
