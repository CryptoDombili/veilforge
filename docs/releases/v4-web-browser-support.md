# VeilForge V4 Web Browser Support

Status: acceptance workflow added and locally validated; production feature flag remains disabled.

## Acceptance tiers

| Browser | CI target | Support status before CI execution |
|---|---|---|
| Chromium | Playwright-pinned Chromium on Ubuntu | local parity passed on Chromium 148; clean-CI execution pending |
| Firefox | Playwright-pinned Firefox on Ubuntu | local Windows launch blocked before app; clean-CI execution pending |
| WebKit | Playwright-pinned WebKit on Ubuntu | local parity passed on WebKit 26.4; clean-CI execution pending |
| Microsoft Edge | real `msedge` channel on Windows | local Edge 151 environment blocked; clean-CI execution pending |

Chromium, Firefox, WebKit, and Edge results are independent. A Chromium pass is never reported as an Edge pass. Firefox or WebKit failures are classified as application incompatibility, unsupported browser API, or CI environment/tooling failure using the safe stage and error code emitted by the acceptance runner.

## Cross-browser acceptance contract

Every browser job must create a fresh context and page, load the isolated V4 preview, initialize the worker, complete a real Payments scan, verify the report, exercise history and export, recover after cancellation with a fresh worker, complete ten create/scan/dispose cycles, report zero orphan workers and pending requests, pass the 390px viewport check, and shut down cleanly.

Timer, listener, and promise cleanup remains independently enforced by the deterministic lifecycle harness in the prerequisite job. Browser jobs additionally require the scan control to be idle and all observed scanner workers to be closed after each iteration.

## Privacy and artifacts

The workflow has read-only repository permissions, requires no secrets, and performs no deployment, publication, release, or remote analysis. It uploads only a seven-day JSON summary containing browser/version, stage outcomes, durations, lifecycle counters, and sanitized error codes. Fixture source, AST, IR, compiler output, exports, and full reports are not uploaded.

## Current limitation

The local Windows host's Edge 151 process reaches the DevTools transport and then crashes before browser connection. The locally installed Playwright Firefox binary also timed out at launch three times without reaching a page or leaving a process behind. These are tracked as local browser/environment limitations. Edge and Firefox support remain unverified until their clean-CI jobs pass.

WebKit exposed a real cancellation race: an active synchronous compiler could finish before the worker processed its abort message. The V4 UI now disposes the worker immediately after requesting abort, making cancellation deterministic without changing the worker protocol, V3 behavior, feature flag, or project limit. WebKit and Chromium both passed the complete acceptance sequence after this fix.
