# VeilForge V4 Programmatic SDK

This package is the supported Node.js ESM boundary for the VeilForge Grant Candidate analyzer. It is private in this repository and is not published by this phase. A consuming ESM project imports from `@veilforge/sdk`; repository examples use the root `veilforge` self-reference, which resolves to the same public entrypoint.

## Minimum scan

```js
import { createVeilForgeClient } from '@veilforge/sdk';

const client = createVeilForgeClient({ compiler: { version: '0.8.24' } });
const result = await client.scanProject({
  projectId: 'example-project',
  sources: { 'contracts/Vault.sol': { content: 'pragma solidity 0.8.24; contract Vault {}' } },
});
```

Inputs require a non-empty `projectId` and a source map of canonical project-relative paths. `projectName`, compiler settings, policy, taxonomy, domains, budgets, and non-secret metadata are optional. Only exact solc 0.8.24 is supported. Absolute paths, traversal, control characters, path collisions, binary source values, and secret-shaped metadata keys are rejected without echoing source content or host paths.

The result exposes stable compilation/analysis summaries, classification and detector summaries, findings, presentation, canonical report, integrity result, Markdown, export package, verification, incomplete reasons, deterministic stage summaries, warnings, and structured errors. It does not expose compiler output, the full AST, or full source text.

`completed` means every stage completed and the final export verified; only this state has `ok: true`. `incomplete` preserves its report, export, verification, and reasons but has `ok: false`. Other terminal states are `failed`, `timed-out`, and `aborted`.

## Staged scans, progress, timeout, and abort

`createScanSession`, `runScanStage`, `runRemainingStages`, `getScanProgress`, and `abortScan` provide ordered staged execution. Sessions are frozen snapshots backed by private state; callers cannot reorder stages or mutate the analyzer session. `stageTimeoutMs`, `globalTimeoutMs`, and `AbortSignal` are forwarded to orchestration. Errors can throw (default) or become a failed result with `throwOnError: false`.

Progress callbacks receive only an event, stage, status, counts, a fixed safe message, and bounded progress metadata. `progressCallbackErrorMode` is `ignore` by default or `fail` for a structured `SDK_PROGRESS_CALLBACK_FAILED` error. Timing, callback counts, hostnames, source, AST, policy text, and secrets are excluded.

## Verification and deterministic behavior

Use `verifyReport`, `verifyExportPackage`, `getExportFile`, and `listExportFiles`. Verification works on copies so it cannot mutate the supplied report or package. With the default `deterministic: true`, normalized-equivalent source input yields the same public projection, report hash, Markdown, export bytes, and stage digest summary. Operational metadata is disabled by default.

Safe defaults are 120-second stage timeout, 300-second global timeout, deterministic output enabled, operational metadata disabled, export enabled, thrown structured errors enabled, and ignored callback exceptions.

Limitations: this phase has no CLI, CommonJS build, worker/process isolation, network compiler download, custom detector registry, deployment gate, UI integration, or package publication. Results are analysis evidence, not a guarantee that a contract is secure.
