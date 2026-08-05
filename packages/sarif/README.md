# @veilforge/sarif

Deterministic SARIF 2.1.0 rendering and verification for verified VeilForge V4 canonical reports. The renderer never embeds source text or snippets and rejects absolute, URI-scheme, empty-segment, and traversal paths.

`renderSarif(report)` returns an object, `renderSarifJson(report)` returns canonical UTF-8 JSON text, and `verifySarif(document, options)` validates the supported profile and report-hash binding.

Critical/high map to `error`, medium to `warning`, low/informational to `note`, and unknown values to the documented `warning` fallback. Original severity and confidence remain properties. Detected and incomplete findings remain results; accepted-risk, policy-approved, and explicit suppressions remain visible with suppression metadata; not-applicable findings are omitted.

The existing Finding V4 fingerprint anchors `primaryLocationLineHash`, `veilforge/v4/findingFingerprint`, and `veilforge/v4/occurrenceFingerprint`. Presentation trace steps become ordered `codeFlows`; remediation guidance remains metadata and no replacement `fix` is invented. Current canonical reports preserve byte offsets rather than line/column, so SARIF regions are emitted only when real line data exists.
