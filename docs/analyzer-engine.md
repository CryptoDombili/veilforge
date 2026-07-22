# Analyzer engine

## Public entry point

```ts
import { scanSources, type SourceFile } from '@veilforge/scanner';

const report = scanSources(files);
```

`files` must contain at least one item and every item contains a normalized logical path and Solidity source string.

## Pipeline

1. Normalize paths and line endings.
2. Parse each file with `@solidity-parser/parser`.
3. Emit `VF000` if a file cannot be parsed.
4. Execute built-in rules on parsed files.
5. Execute optional custom line rules.
6. Sort findings by severity, path, line and rule ID.
7. Generate selector policy recommendations.
8. Calculate project and contract scores.
9. Determine triage state.
10. Build observed exposure chains.
11. Build the ordered treatment plan.
12. Calculate canonical source and report hashes.

## API surface

```ts
scanSources(files, options?)
canonicalSourceHash(files)
canonicalReportHash(report)
generatePolicyManifest(report)
compareReports(previous, current)
formatTextReport(report)
formatMarkdownReport(report, projectName?)
formatTreatmentPlanMarkdown(report)
```

## Deterministic custom rules

`ScanOptions.customRules` accepts `CustomDetectionRule[]`. Each rule evaluates every normalized source line. The rule callback must be deterministic and must not perform network calls, use time, randomness or mutable external state.

```ts
const report = scanSources(files, { customRules: [rule] });
```

## Scanner versioning

`SCANNER_VERSION` is `1.8.0`. Change it whenever built-in output logic changes in a way that can affect canonical reports.
