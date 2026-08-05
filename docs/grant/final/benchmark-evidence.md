# V4 Benchmark Evidence

## Result

| Metric | Verified value |
|---|---:|
| Maintained oracle corpus | 60 cases |
| Case-level result | 60/60 passed |
| True positives | 56 |
| False positives | 0 |
| False negatives | 0 |
| Negative-corpus false positives | 0 |
| Release gate | `passed / allow` |
| Nondeterministic results | 0 |
| Unsafe locations | 0 |

The result is bounded to `benchmarks/v4/oracle.json` version 1.0.0 and the maintained fixtures. It is not a claim of universal correctness, an audit, formal verification, vulnerability absence, or confidentiality.

## Domain view

Each domain contains 8 positive, 6 negative, and 6 adversarial cases. “TP” is finding-level agreement with the maintained oracle; case passes also include expected compile disposition, analysis status, incomplete reasons, location agreement, and integrity checks.

| Domain | Positive | Negative | Adversarial | Case result | TP / FP / FN | Detector coverage | Limitation |
|---|---:|---:|---:|---:|---:|---|---|
| Arc Payments | 8 | 6 | 6 | 20/20 | 18 / 0 / 0 | Maintained Payments disclosure surfaces | Not all payment protocols or custom semantics |
| Arc Treasury | 8 | 6 | 6 | 20/20 | 19 / 0 / 0 | Maintained Treasury disclosure surfaces | Not all governance/authorization models |
| Arc Private Credit | 8 | 6 | 6 | 20/20 | 19 / 0 / 0 | Maintained Private Credit disclosure surfaces | Not underwriting correctness or legal compliance |
| **Total** | **24** | **18** | **18** | **60/60** | **56 / 0 / 0** | Three versioned domain packs | Corpus-bounded evidence |

## What the gate checks

The release gate requires coverage 60, zero false negatives, zero negative false positives, zero integrity failures, zero unsafe locations, zero missing incomplete reasons, zero missing detector IDs, correct compile dispositions, and deterministic results. Current status is `passed / allow` with no gate reason.

## Reproduction

```powershell
npm.cmd run benchmark:v4
npm.cmd run smoke:v4-release-gate
```

Canonical benchmark output: `output/benchmark-v4/veilforge-benchmark-v4.json` (local generated evidence). Maintained inputs: `benchmarks/v4/oracle.json` and `tests/corpus/`.

## Interpretation boundary

- A clean result does not prove that a project is confidential or secure.
- Findings require engineering and policy review.
- Unsupported compiler versions, unresolved imports, inline assembly, dynamic calls, alias uncertainty, unknown external returns, and budget exhaustion can produce unsupported or incomplete states.
- False positives or false negatives remain possible outside the maintained corpus.
- The benchmark should expand with real, reviewed Arc developer patterns; historical scores must not be silently compared across changed oracles.

