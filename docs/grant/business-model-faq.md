# Business Model FAQ

All answers describe a planning model. Paid plans, accounts, billing, and subscription payment rails are not live in the V4 Grant Candidate.

## Who pays?

**Short answer:** Teams pay for managed private CI, shared governance, retained evidence, support, and private deployment—not for access to the local scanner core.

**Long answer:** The first target buyer is a 2–10 person Web3 or Arc team with 1–5 active Solidity repositories, regular pull requests, and no full-time security specialist. Developer and Team are intended for recurring hosted workflows. Enterprise is intended for organizations needing private runners or deployment, onboarding, SLA, compliance exports, or tailored policy support under a custom annual contract.

## What remains free?

**Short answer:** The open-source scanner core, CLI, local browser scanning, basic SDK/findings, Arc domain scanning, portable exports, report schema/verification, limited local history, documentation, and community support.

**Long answer:** A developer should be able to inspect a local Solidity project and verify its report without an account or subscription. The free boundary includes Arc Payments, Treasury, and Private Credit detector coverage in the public scanner, plus JSON and Markdown exports. Commercial packaging begins where VeilForge operates persistent hosted infrastructure or organization controls.

## Why will developers pay?

**Short answer:** To put deterministic checks into private pull-request workflows and avoid operating the CI, history, policy, and support layer themselves.

**Long answer:** The willingness-to-pay hypothesis is operational: private-repository automation, managed history, higher hosted limits, multiple projects, policy gates, and timely support can reduce repeated setup and review work. Team adds roles, shared policy, scheduling, notifications, dashboards, and audit trail. This hypothesis must be validated with usage and interviews; VeilForge does not promise audit-equivalent assurance.

## How does VeilForge sustain itself after the grant?

**Short answer:** Free adoption feeds qualified hosted demand; Developer, Team, and Enterprise revenue funds operations and reinvestment in detector quality and Arc coverage.

**Long answer:** The intended loop is open-source core → free adoption → hosted CI need → Developer/Team conversion → Enterprise/self-hosted revenue → reinvestment. Conversion, churn, hosted unit cost, support load, and Enterprise cycles are explicit risks. If customer evidence does not support paid operation, the project should reduce hosted scope rather than rely on guaranteed future grants.

## How will grant funding accelerate revenue readiness?

**Short answer:** It funds product engineering, hosted CI validation, security work, onboarding, Arc integrations, and developer operations before charging customers.

**Long answer:** The proposed allocation is 35% product engineering, 15% hosted CI infrastructure, 15% security validation, 10% documentation/onboarding, 15% Arc ecosystem integrations, and 10% developer support/operations. The total is 100%. This supports measurable readiness—secure accounts, metering, unit economics, tenant controls, validated workflows, and customer discovery—not a premature billing screen.

## Why is the model aligned with Circle and Arc?

**Short answer:** It keeps Arc-relevant Solidity privacy analysis accessible while creating a sustainable path for managed developer workflows.

**Long answer:** VeilForge focuses its grant-candidate scope on application-level disclosure patterns relevant to Arc Payments, Treasury, and Private Credit. Open local use lowers adoption friction; hosted CI and support can fund continued detector and integration work. USDC subscriptions are only a later option, planned and subject to compliance and production validation. Alignment does not imply endorsement, partnership, or guaranteed ecosystem demand.

## What are the first commercial milestones?

**Short answer:** Validate the first buyer, measure hosted CI economics, ship V4.1 accounts/metering/Developer foundations, then validate V4.2 Team workflows.

**Long answer:** First, interview and observe the primary customer profile through repeated pull-request cycles. Second, measure compute, storage, retention, privacy, and support costs. Third, implement secure accounts, metering, a billing abstraction, and private CI for a Developer-plan foundation. Fourth, validate Team authorization, tenant isolation, shared policy, and organization billing. Card, USDC, and Enterprise capabilities follow only after their production and compliance gates.

## What are the main commercial risks?

**Short answer:** Weak conversion, volatile budgets, open-source monetization, infrastructure/support costs, long Enterprise cycles, Arc dependency, and audit-tool confusion.

**Long answer:** Free users may not need hosted capabilities; Web3 budgets can contract; open-source users can self-host; compute and expert support can compress margins; Enterprise procurement can be slow; Arc adoption may be narrower than expected; and users may mistake deterministic findings for an audit. Mitigations include measured pilots, cost-based quotas, portable open formats, diversified Solidity applicability, bounded claims, explicit limitations, and no dependence on Enterprise or repeat grants for initial viability.

