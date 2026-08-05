# VeilForge V4 Web Rollout and Rollback Runbook

Status: production flag remains disabled. This runbook does not authorize deployment.

## Invariants

- `VEILFORGE_WEB_V4_ENABLED` is build-time only and defaults to `false`.
- The default build remains V3.2.2; a V4 preview is generated separately in `dist-preview-v4/`.
- V3 and V4 browser storage namespaces remain separate.
- Rollback never deletes or converts V4 reports and never writes to V3 history.
- Exact solc remains 0.8.24 and the browser project limit remains 1 MiB.
- Source code remains browser-local. No telemetry, upload, or remote compiler may be introduced for rollout measurement.

## Required cache policy

The current runtime files are covered by a worker digest manifest, but most filenames are not content-addressed. Hosting must therefore use:

- HTML and `config.js`: `Cache-Control: no-store`.
- Worker entry, runtime modules, runtime config, and manifests: `Cache-Control: no-cache, must-revalidate`.
- `soljson-v0.8.24.js`: `Cache-Control: public, max-age=31536000, immutable`, because the exact compiler artifact and digest are pinned for 0.8.24.
- Hard refresh after a rollout or rollback when validating an operator session.

There is no service worker. V3 does not import or start the V4 worker while the flag is false. Protocol mismatch, compiler digest mismatch, release-manifest mismatch, and report-integrity mismatch must fail closed.

## Rollout stages

### 1. Internal preview

- Entry criteria: targeted acceptance, lifecycle stress, rollback browser smoke, complete regression, benchmark 60/60, and release gate passed/allow.
- Metrics: manual cold/warm load, worker-ready time, first/repeated scan duration, abort recovery, storage recovery, browser console errors, and orphan-worker count.
- Rollback trigger: any unverified render, source leakage, stuck UI, incomplete cleanup, integrity mismatch, or regression.
- Responsible action: produce the default-false build and stop distributing the preview URL.
- Data boundary: local fixtures only; no analytics or source upload.

### 2. Limited preview

- Entry criteria: internal preview complete in Chrome and Edge; Firefox/WebKit risks explicitly accepted or tested.
- Metrics: manual acceptance checklist per session, structured error-code counts recorded outside the product without source/path data, scan completion, and rollback drill result.
- Rollback trigger: repeated worker lifecycle failure, cache mismatch, quota recovery failure, or V3 compatibility regression.
- Responsible action: disable the build flag and publish only the V3 default artifact through the authorized release process.
- Data boundary: opt-in local analysis; no product telemetry.

### 3. Production opt-in

- Entry criteria: limited preview sign-off, hosting cache headers verified, incident owner assigned, and rollback artifact retained.
- Metrics: manual support reports containing only error code, stage, runtime/report version, and request state.
- Rollback trigger: integrity failure, unsafe location, source exposure, persistent UI lock, or material performance regression.
- Responsible action: restore the default-false artifact; preserve both storage namespaces.
- Data boundary: no source, AST, IR, compiler output, absolute path, or report evidence in diagnostics.

### 4. Production default

- Entry criteria: opt-in window completed with no open release blocker and explicit product/security approval.
- Metrics: the same local/manual gates; telemetry remains out of scope.
- Rollback trigger: any release-gate regression or unresolved compatibility incident.
- Responsible action: revert to the retained V3 default artifact using only the build flag.
- Data boundary: unchanged local-only boundary.

### 5. V3 rollback window

- Retain a verified default-false artifact throughout rollout.
- Keep V3 history read/write behavior unchanged and V4 history untouched.
- Keep rollback available until the production-default window and compatibility risks are formally closed.

## Rollback drill

1. Build the isolated V4 preview with `build:web-v4-preview`.
2. Verify that its generated `config.js` has `WEB_V4_ENABLED = true`.
3. Run a verified V4 scan and record only the V4 report hash and project ID.
4. Produce the normal build with the flag omitted; verify generated `config.js` has `WEB_V4_ENABLED = false`.
5. Confirm V3 scan, history, export, proof, and navigation behavior.
6. Confirm the V4 namespace still exists but is not read or converted by V3.
7. Re-open the isolated V4 preview and re-verify the stored V4 envelope before rendering it.
8. Confirm that no manual source edit, storage deletion, or namespace migration was used.

## Recovery actions

- Oversize input: remove files until both per-file and 1 MiB project limits pass.
- Timeout or crash: retry once with a fresh worker; do not render or persist partial output.
- Corrupt V4 history: use the V4-only clear action; preserve legacy V3 history.
- Quota/storage-disabled: free site storage or keep the verified result in-session and export it; never claim it was persisted.
- Cache mismatch: hard refresh, verify cache headers, and rebuild; do not fall back silently to V3 inside a V4 preview.
- Rollback: distribute the default-false build through the authorized release process.

## Current Phase 5B-3 blocker

The cross-browser repeated-scan acceptance runner did not complete within its bounded execution window after three attempts. Production rollout remains blocked until the exact lifecycle stage is localized, the worker/UI is shown not to leak or orphan resources across the stress loop, and the complete validation chain passes once.

## Phase 5B-3.1 blocker status

The original lifecycle hang is localized and fixed. Disposing a worker before its ready handshake could leave `scan()` awaiting an unresolved ready promise. Termination now rejects that pending handshake, rechecks disposal after readiness, clears request timers and state, and detaches worker callbacks. The deterministic lifecycle suite passed 10/10 create/scan/dispose iterations with zero active workers, requests, timers, listeners, promises, and orphan workers. Chrome also passed 10/10 real repeated scans with zero dedicated scanner-worker targets after each iteration.

Production rollout is still blocked by local Edge acceptance startup. Edge failed to expose a DevTools page target in the bounded launch window three consecutive times, before navigation or worker creation. The mandatory stop rule prevented the remaining browser rollback, V4/V3 smoke, benchmark/gate, and regression chain from running. Keep the production feature flag false. Do not advance to internal preview or Phase 5C until Edge acceptance and the complete ordered validation chain pass once.
