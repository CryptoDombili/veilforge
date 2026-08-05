# VeilForge Commercial Model

## Status and purpose

This document is a planning foundation for grant and product decisions. It is not a public price commitment, revenue forecast, customer claim, or representation that hosted billing exists in the V4 Grant Candidate. V4 remains a local-first product; account, metering, billing, organization, and paid support capabilities are roadmap items.

## Commercial thesis

VeilForge keeps the security-analysis foundation open and useful without an account. Revenue is expected from operational convenience and organizational control around that foundation: managed private-repository CI, hosted history, team workflows, policy administration, support, and private deployment.

The intended sustainability loop is:

> open-source core → free adoption → active teams need managed CI → Developer/Team conversion → Enterprise/self-hosted revenue → reinvestment in detectors and Arc coverage

This model avoids charging developers merely to inspect their own Solidity locally. It also avoids treating a grant as permanent operating income.

## Proposed plans

| Plan | Intended user | Commercial status | Core value |
| --- | --- | --- | --- |
| Community | Individual builders, evaluators, open-source users | Free | Local analysis and portable reports without a hosted dependency |
| Developer | Individual professionals and small projects | Paid roadmap | Managed private-repository CI and higher hosted limits |
| Team | Product and protocol teams | Paid roadmap | Shared governance, history, automation, and audit trail |
| Enterprise | Regulated or infrastructure-heavy organizations | Custom annual roadmap | Private deployment, SLA, onboarding, and tailored controls |

Community is proposed at `$0`. Developer at `$19–39/month`, Team at `$99–249/month`, and Enterprise through a custom annual contract are planning hypotheses only. No paid plan or payment rail is claimed to be live.

## What stays open and free

- Open-source scanner core and CLI.
- Local browser scanning.
- Basic SDK, findings, JSON/Markdown export, report schema, and verification.
- Arc Payments, Treasury, and Private Credit scanning covered by the public detector set.
- Limited local history, public documentation, and community support.

## What may be monetized

- Managed CI and private-repository automation.
- Hosted API quotas, scan history, scheduling, and organization dashboards.
- Team roles, shared policies, centralized audit trail, and notifications.
- Managed report/proof history and compliance-oriented exports.
- Priority or dedicated support, private runners, and self-hosted distribution.

Paid hosting must not make local report verification proprietary. Custom detectors and policies may be sold as services or packages without closing the common report contract.

## Initial customer and buying reason

The primary early buyer is a 2–10 person Web3 or Arc development team with 1–5 active Solidity repositories, regular pull-request activity, no full-time security specialist, and payment, treasury, or private-credit logic. The buyer pays for deterministic checks in the existing review workflow, centralized evidence, and reduced operational setup—not for a promise that VeilForge replaces an audit.

## Revenue and cost logic

Near-term recurring revenue is modeled from Developer and Team subscriptions. Enterprise pilots use a monthly-equivalent value solely for scenario comparison; actual Enterprise pricing would be an annual custom contract. Hosted infrastructure and support/operations are tracked separately so growth that costs more than it earns is visible.

The model deliberately excludes transaction fees, token revenue, data resale, and assumed grant renewals. It also excludes unvalidated customer or partnership claims.

## Commercial guardrails

- Findings are engineering signals, not formal verification or an audit replacement.
- The 60-case V4 release corpus is a bounded technical baseline, not a commercial efficacy guarantee.
- Arc alignment is based on relevant developer workflows, not a claim of endorsement or partnership.
- USDC subscriptions are planned and subject to compliance and production validation.
- Prices, conversions, churn, and revenue scenarios remain hypotheses until measured with real customers.

