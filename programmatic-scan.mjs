# Integration Examples

## Node script

```bash
node examples/programmatic-scan.mjs
```

## Custom rule

```bash
node examples/custom-rule.mjs
```

## CLI in CI

```bash
node packages/analyzer/cli.mjs scan contracts --format json --output report.json
node -e "const r=require('./report.json'); process.exit(r.status === 'Deployment Blocked' ? 1 : 0)"
```

For ESM-only CI environments, read the JSON with `fs` and `JSON.parse`.

## Static browser reuse

The web build copies the canonical engine to `dist/engine/`. Another static product can import:

```js
import { scanProject } from '/engine/index.js';
```

## Policy-only integration

```js
const report = scanProject(files);
const manifest = generatePolicyManifest(report);
```

Validate the output against `schemas/arc-policy-manifest.schema.json` before passing it to another system.

## Report comparison

```js
const result = compareReports(baselineReport, currentReport);
console.log(result.resolved, result.ongoing, result.introduced);
```

Comparison uses deterministic finding fingerprints rather than array positions.
