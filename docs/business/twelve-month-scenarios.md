# Twelve-Month Commercial Scenarios

## Interpretation

These are month-12 planning scenarios, not forecasts or guarantees. “Annualized revenue” is month-12 MRR multiplied by 12 and is not revenue expected to be recognized during the first year. Customer counts are hypothetical exit-state accounts. Free users are active free teams or individual users in the same measurement window.

Developer is modeled at `$29/month`; Team at `$149/month`. Enterprise values are monthly equivalents of hypothetical annual pilot contracts, not published prices.

## Scenario assumptions and results

| Metric at month 12 | Conservative | Base | Upside |
| --- | ---: | ---: | ---: |
| Active free users | 500 | 1,500 | 4,000 |
| Developer customers | 10 | 45 | 120 |
| Team customers | 2 | 8 | 25 |
| Enterprise pilots | 0 | 1 | 3 |
| Enterprise monthly equivalent per pilot | `$0` | `$1,500` | `$2,500` |
| Developer + Team conversion | `2.40%` | `3.53%` | `3.63%` |
| Assumed monthly paid-account churn | `4.0%` | `3.0%` | `2.0%` |
| Developer MRR | `$290` | `$1,305` | `$3,480` |
| Team MRR | `$298` | `$1,192` | `$3,725` |
| Enterprise monthly equivalent | `$0` | `$1,500` | `$7,500` |
| Total month-12 MRR | **`$588`** | **`$3,997`** | **`$14,705`** |
| Annualized revenue run rate | **`$7,056`** | **`$47,964`** | **`$176,460`** |
| Hosted infrastructure cost/month | `$350` | `$900` | `$2,500` |
| Support and operations cost/month | `$250` | `$1,000` | `$3,000` |
| MRR less listed monthly costs | **`-$12`** | **`$2,097`** | **`$9,205`** |

## Calculation checks

### Conservative

- Conversion: `(10 + 2) ÷ 500 = 2.40%`.
- MRR: `10 × $29 + 2 × $149 = $290 + $298 = $588`.
- Annualized run rate: `$588 × 12 = $7,056`.
- Listed monthly contribution: `$588 - $350 - $250 = -$12`.

### Base

- Conversion: `(45 + 8) ÷ 1,500 = 3.53%` rounded.
- MRR: `45 × $29 + 8 × $149 + 1 × $1,500 = $1,305 + $1,192 + $1,500 = $3,997`.
- Annualized run rate: `$3,997 × 12 = $47,964`.
- Listed monthly contribution: `$3,997 - $900 - $1,000 = $2,097`.

### Upside

- Conversion: `(120 + 25) ÷ 4,000 = 3.625%`, shown as `3.63%`.
- MRR: `120 × $29 + 25 × $149 + 3 × $2,500 = $3,480 + $3,725 + $7,500 = $14,705`.
- Annualized run rate: `$14,705 × 12 = $176,460`.
- Listed monthly contribution: `$14,705 - $2,500 - $3,000 = $9,205`.

## What must be measured

- Activation: a user completes a meaningful local scan and reviews findings.
- Hosted intent: an active team requests private CI, repeat history, or shared policies.
- Conversion: paid Developer and Team accounts divided by active free users in the same cohort/window.
- Churn: paid accounts lost during the month divided by paid accounts at the start of that month.
- Infrastructure cost per hosted scan and per retained report.
- Support hours per plan and time to resolve operational incidents.
- Enterprise pilot duration, procurement cost, and conversion to annual contract.

The scenarios exclude salaries, tax, payment processing, legal/compliance costs, and grant proceeds. A production operating plan must add those items before any runway claim is made.

