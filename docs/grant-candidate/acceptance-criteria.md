# Grant Candidate Acceptance Criteria

Status: normative phase gates for v4.0.0-gc.1.

| Gate | Passing condition |
|---|---|
| Product boundary | Required non-claims and three financial domains are present and tested |
| Corpus contract | At least 60 cases: 24 positive, 18 negative, 18 adversarial |
| Corpus coverage | Every domain and every normative sink is represented; required adversarial tags are present |
| Compiler policy | Exact `solc 0.8.24`; every other version yields `unsupported-compiler` |
| AST parse | Every supported valid corpus case compiles or yields an expected explicit error; no clean partial result |
| Determinism | Canonical identity and hash vectors are stable over 100 repetitions and path/input order permutations |
| Occurrence preservation | Duplicate semantic sinks retain distinct occurrence IDs and locations |
| Precision | Macro precision at least 90%; no released detector below 80% |
| Recall | Overall recall at least 85%; critical payment/treasury detectors at least 90% |
| Negative regression | Zero critical/high false positives; overall negative-corpus false-positive rate at most 5% |
| Source locations | Golden source/sink byte ranges match 100%; line insertion does not change finding ID |
| SARIF | OASIS SARIF 2.1.0 valid; stable rule ID, location, partial fingerprint, and code flow where applicable |
| Contract | Unit, fuzz, invariant, ABI/client tests pass; target 95% line and 90% branch coverage |
| Attestation | Mutation of any bound field causes verifier rejection; revoked/expired/untrusted issuer fails gate |
| Arc E2E | Three consecutive Testnet publish/verify runs pass and tampered/revoked cases fail |

Phase 1 is complete only when specification, schemas, corpus, golden vectors, determinism tests, legacy 51 tests, typecheck, and release manifest checks all pass.
