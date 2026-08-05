# Grant Milestones and Budget

Status: proposed post-grant plan. Milestones have no fabricated calendar dates and do not imply grant approval.

## Budget allocation

| Category | Share | Intended use |
|---|---:|---|
| Product engineering | 35% | Hosted workflow foundation while preserving the open/local contract |
| Hosted CI infrastructure | 15% | Isolated runners, metering, retention, reliability, and unit-cost measurement |
| Security validation | 15% | Tenant boundaries, runtime/dependency risk, proof/report integrity, production controls |
| Documentation and onboarding | 10% | Honest product boundaries, examples, migration guidance, reduced support friction |
| Arc ecosystem integrations | 15% | Payments, Treasury, and Private Credit workflow expansion and onboarding |
| Developer support and operations | 10% | Pilot support, feedback triage, support-load measurement, operational playbooks |
| **Total** | **100%** | Allocation remains subject to the grant agreement and operating plan |

## Milestone 1 — Hosted Foundation

**Deliverables:** secure account model, payment-neutral metering boundary, isolated private CI pilot, cost instrumentation, privacy/retention/deletion policy, threat model, and operational rollback.

**Acceptance evidence:** tenant-isolation tests; no cross-account access; measured cost per scan and retained report; documented retention/deletion controls; incident and rollback drill; no source content in product analytics.

**Risk:** hosted source and findings are sensitive; compute/storage cost may exceed willingness to pay.

**Budget categories:** Product engineering, Hosted CI infrastructure, Security validation.

## Milestone 2 — Developer Plan Validation

**Deliverables:** private-repository checks, managed report history, policy-gate workflow, usage limits based on measured costs, and structured customer-discovery/pilot process.

**Acceptance evidence:** repeat use across more than one PR cycle; explicit willingness-to-pay evidence; measured activation, conversion intent, churn signals, CI runtime, and support hours; Community capabilities remain available.

**Risk:** local Community tooling may satisfy demand; pricing ranges may not match value or cost.

**Budget categories:** Product engineering, Hosted CI infrastructure, Documentation and onboarding, Developer support and operations.

## Milestone 3 — Team Foundation

**Deliverables:** organization workspace, roles, tenant isolation, shared policies, centralized evidence history, audit trail, and team-level administrative boundaries.

**Acceptance evidence:** authorization matrix tests; tenant-isolation review; shared-policy integrity; auditable actor/action records; deletion/export paths; support and incident procedures.

**Risk:** multi-tenant authorization and retained security evidence materially increase security and compliance obligations.

**Budget categories:** Product engineering, Security validation, Developer support and operations.

## Milestone 4 — Arc Expansion and Independent Validation

**Deliverables:** reviewed detector/corpus expansion, Arc onboarding material, ecosystem integration prototypes, independent contract/runtime review, and evidence-driven mainnet readiness update.

**Acceptance evidence:** versioned oracle additions with reviewed expectations; no regression to the existing release gate; published limitations; independent findings and remediation record; verified official network sources before any mainnet config proposal.

**Risk:** new patterns can expose false-positive/false-negative gaps; official network details and integration priorities may change.

**Budget categories:** Arc ecosystem integrations, Security validation, Documentation and onboarding, Developer support and operations.

## Cross-milestone rules

- No paid capability is called live before its production evidence exists.
- No benchmark expansion silently rewrites historical results.
- No mainnet deployment follows from grant funding alone; all independent technical and operational gates still apply.
- No customer, partner, endorsement, revenue, or adoption claim is made without verifiable evidence and permission.
- The free/open local verification path remains usable without an account.

