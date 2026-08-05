# @veilforge/gate

Deterministic policy gates for verified VeilForge V4 reports and export packages. Config schema `1.0.0` uses `failOnSeverity`, `minimumConfidence`, `includedDomains`, `includedCategories`, `excludedRuleIds`, `dispositions`, `failOnIncomplete`, `failOnInvalidPolicy`, count limits, and an optional `new-only` baseline.

Defaults fail on new detected high/critical findings, incomplete analysis, or invalid policy. Accepted risks, policy-approved findings, suppressed findings, low/informational findings, and verified baseline matches remain visible but do not fail the default gate. Baselines accept either a verified canonical report or an explicit fingerprint list.

Exit codes: pass `0`, invalid config `2`, invalid report `8`, invalid export `9`, internal error `11`, gate failure `12`.
