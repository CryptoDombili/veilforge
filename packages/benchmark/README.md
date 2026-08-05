# @veilforge/benchmark

Deterministic, local-only release benchmarking for the 60-case VeilForge Grant Candidate corpus. The versioned oracle records expected compiler/analysis dispositions, stable detector identities, finding contracts, evidence/trace requirements, grouping, and project-relative location expectations. Runtime differences are reported as false positives, false negatives, metadata disagreements, incomplete-reason loss, or compile-disposition mismatch; fixtures are not relaxed to hide deviations.

`runBenchmark`, `runBenchmarkCase`, `compareBenchmarkResult`, `buildBenchmarkReport`, and `evaluateReleaseGate` form the release-tool API. Ratios with a zero denominator are reported as `not-applicable`. Operational timing, PIDs, worker IDs, checkout roots, source text, and secrets are excluded from JSON and Markdown.
