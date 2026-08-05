# Grant Sustainability

## Purpose and claim boundary

This document explains how grant funding could accelerate commercial readiness without presenting a grant, customer, partnership, or future revenue as guaranteed. VeilForge V4 Grant Candidate does not have production billing or paid plans. The commercial model is a planning hypothesis built around an open-source, local-first core.

## Why the model fits the product

VeilForge can remain useful at `$0`: scanner core, CLI, local browser scanning, basic SDK/findings, Arc Payments/Treasury/Private Credit scanning, JSON/Markdown exports, report schema and verification, limited local history, public documentation, and community support.

Potential revenue comes from hosted and organizational work that creates continuing operating cost and management value: managed private-repository CI, pull-request checks, higher hosted limits, retained history, shared policies, scheduling, roles, audit trails, compliance-oriented exports, private deployment, and support.

## Proposed use of grant funds

| Allocation | Share | Rationale |
| --- | ---: | --- |
| Product engineering | `35%` | Build and harden the hosted workflow foundation while maintaining the local/open contract. |
| Hosted CI infrastructure | `15%` | Validate isolated runners, metering, retention, reliability, and real unit costs. |
| Security validation | `15%` | Test tenant boundaries, dependency/runtime risks, proof/report integrity, and production controls. |
| Documentation and onboarding | `10%` | Reduce adoption and support friction with honest boundaries, examples, and migration guidance. |
| Arc ecosystem integrations | `15%` | Extend and validate workflows relevant to Arc Payments, Treasury, and Private Credit builders. |
| Developer support and operations | `10%` | Operate pilots, triage feedback, measure support load, and maintain response playbooks. |
| **Total** | **`100%`** | Complete allocation; actual spending remains subject to the grant agreement and operating plan. |

The budget favors engineering and validation because revenue readiness depends on a trustworthy hosted boundary, not merely a pricing page. Documentation and support are funded because misuse or audit-tool confusion is a material risk. Arc integration funding is directed to concrete developer workflows, not an assumption of endorsement.

## Post-grant sustainability loop

1. The open-source core and free local workflow enable adoption without procurement or billing.
2. Active teams encounter recurring needs for managed private CI, shared history, and policy gates.
3. Those teams may convert to Developer or Team plans when managed operation costs less than maintaining it themselves.
4. Organizations with privacy, deployment, procurement, or support constraints may fund Enterprise/self-hosted contracts.
5. Subscription and contract revenue is reinvested in detector quality, Arc coverage, security validation, documentation, and support.

This loop is testable: hosted-intent requests, conversion, churn, infrastructure cost, support hours, and pilot-to-contract outcomes must be measured. If paid conversion remains weak, scope and costs must contract rather than assuming another grant.

## Twelve-month planning range

Using the consistent modeling points of `$29/month` Developer and `$149/month` Team:

| Scenario | Month-12 MRR | Annualized run rate | Listed monthly infrastructure + support cost |
| --- | ---: | ---: | ---: |
| Conservative | `$588` | `$7,056` | `$600` |
| Base | `$3,997` | `$47,964` | `$1,900` |
| Upside | `$14,705` | `$176,460` | `$5,500` |

These values are hypotheses, not first-year recognized revenue. Enterprise contributions use hypothetical monthly equivalents of custom annual pilot contracts. Full assumptions and calculations are maintained in `docs/business/twelve-month-scenarios.md`.

## Payment roadmap

- V4.1: accounts, hosted usage metering, Developer plan, and payment-neutral billing abstraction.
- V4.2: Team workspace, roles, and organization billing.
- Later: card and USDC subscription options. USDC support is planned and subject to compliance and production validation.
- Enterprise: annual contracts and validated self-hosted/private support.

## Circle and Arc alignment

The model supports builders working on payment, treasury, and private-credit Solidity by keeping local analysis accessible and funding reliable automation around it. Grant funding can accelerate Arc-relevant detector validation, integration guidance, and developer support. This is product alignment, not a claim that Circle or Arc has endorsed VeilForge or guaranteed adoption.

## Success evidence

- Repeated use by the defined 2–10 person target teams.
- Documented willingness to pay for private CI and shared evidence.
- Measured hosted cost and bounded support burden.
- Secure metering, tenant isolation, and data-retention controls.
- Conversion without removing Community capabilities.
- Revenue reinvestment tied to detector and Arc workflow outcomes.

