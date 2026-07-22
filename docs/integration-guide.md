# Integration guide

## Use the scanner in another TypeScript application

```ts
import { scanSources } from '@veilforge/scanner';

const report = scanSources([
  { path: 'Vault.sol', content: vaultSource },
  { path: 'Access.sol', content: accessSource },
]);
```

## Build a deployment gate

```ts
const report = scanSources(files);

if (!report.triage.deploymentAllowed) {
  throw new Error(`VeilForge blocked deployment: ${report.summary.critical} critical findings`);
}
```

The CLI provides equivalent CI behavior:

```bash
veilforge scan contracts --fail-on critical
```

## Generate a policy artifact

```ts
import { generatePolicyManifest } from '@veilforge/scanner';

const manifest = generatePolicyManifest(report);
```

## Store a proof

Use the ABI from `@veilforge/shared` and call the registry with:

1. `projectId`
2. `sourceHash`
3. `reportHash`
4. score
5. optional report URI
6. scanner version

See `examples/publish-arc-proof`.

## Package status

`@veilforge/scanner` and `@veilforge/shared` include publish-ready package metadata, but this repository does not claim that either package is currently published to the public npm registry. Workspace consumers can import them directly after cloning or forking the monorepo.
