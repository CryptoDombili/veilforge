# Pricing Hypothesis

## Planning status

All figures below are planning hypotheses for customer discovery and grant sustainability analysis. VeilForge V4 Grant Candidate has no live account, billing, subscription, or payment system. These figures are not offers, commitments, or revenue guarantees.

| Plan | Planning price | Billing assumption | Intended value boundary |
| --- | ---: | --- | --- |
| Community | `$0` | Free | Local/open-source use and portable reports |
| Developer | `$19–39/month` | Monthly hypothesis | Managed CI for individuals and small projects |
| Team | `$99–249/month` | Monthly hypothesis | Shared organization workflow and governance |
| Enterprise | Custom | Annual contract hypothesis | Private deployment, SLA, onboarding, and dedicated support |

## Packaging rationale

Community removes adoption friction and keeps independently verifiable scanning available. Developer prices the time saved by private-repository automation and managed history. Team prices shared controls, scheduled operations, and collaboration. Enterprise pricing cannot be responsibly standardized before deployment, support, compliance, and procurement requirements are discovered.

## Scenario modeling points

The twelve-month scenarios use `$29/month` for Developer and `$149/month` for Team, both within the planning ranges. Enterprise pilots use explicitly stated monthly-equivalent assumptions only to compare exit run rates:

- Conservative: no paid Enterprise pilot.
- Base: one pilot at `$1,500/month` equivalent.
- Upside: three pilots at `$2,500/month` equivalent each.

`MRR = Developer customers × $29 + Team customers × $149 + paid Enterprise monthly equivalents`.

`Annualized revenue = month-12 MRR × 12`.

Annualized revenue is a run-rate indicator, not recognized revenue for the first twelve months. It assumes the month-12 customer mix persisted for a full year and therefore must not be presented as cash collected.

## Validation questions

- Does a private-repository PR check save enough engineering time to support the Developer range?
- Do roles, shared policies, scheduling, and centralized evidence support the Team range?
- Which limits are understandable without penalizing local/open-source use?
- What security, procurement, and support obligations determine an Enterprise contract?
- Do card and USDC options change conversion or merely payment preference?

Prices should change only after interviews, willingness-to-pay tests, pilot usage, infrastructure measurements, and support load are observed. USDC subscription support is planned and subject to compliance and production validation.

