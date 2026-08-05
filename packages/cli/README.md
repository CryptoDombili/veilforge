# VeilForge V4 CLI

This private Node.js ESM package provides the supported Phase 4A-2 command-line boundary. It is not published in this phase.

```sh
veilforge scan --project-id example --source contracts --domain payments --output .veilforge
veilforge verify-report .veilforge/veilforge-report-v4.json
veilforge verify-export .veilforge
```

`scan` discovers project-relative Solidity files without following symlinks, starts a separate child process, and communicates through versioned IPC. The parent enforces the hard global timeout and terminates an unresponsive worker after a short grace period. The first Ctrl+C requests graceful abort; a second forces termination.

Exports are verified, written to a staging directory with synced files, and atomically renamed. Existing output is protected unless `--overwrite` is explicit. Overwrite accepts only an existing standard three-file export set, so unrelated directory contents are not removed.

`--json` writes exactly one JSON document to stdout and suppresses progress. Normal progress goes to stderr. Source content, AST, compiler output, absolute host paths, and secrets are not printed. The CLI makes no network, analytics, telemetry, wallet, or deployment-gate calls.

Exit codes: 0 completed/verified, 2 arguments/config, 3 source, 4 scan failure, 5 incomplete, 6 timeout, 7 aborted, 8 report invalid, 9 export invalid, 10 output failure, 11 worker protocol. Exit 1 is reserved for unexpected internal failure.

Limitations: no SARIF, GitHub Action, UI integration, CommonJS build, interactive wizard, package publication, or security guarantee. Abort of synchronous work becomes immediate through parent process termination rather than cooperative interruption inside solc.
