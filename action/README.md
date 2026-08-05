# VeilForge V4 GitHub Action

This JavaScript action runs the public VeilForge CLI in an isolated child process, writes a verified export, renders SARIF, evaluates the configured gate, and exposes artifact paths and deterministic decision fields. It uses an argument array with `shell: false`; source content, environment values, and secrets are not logged.

Inputs are documented in `action.yml`. `project-id`, `source`, and `gate-config` are required. Optional compiler, policy, taxonomy, baseline, output, upload, failure, and timeout controls are validated before execution. Outputs include status, pass state, report hash, finding counts, incomplete count, SARIF/export paths, and gate decision.

The action does not call GitHub APIs. Follow it with `github/codeql-action/upload-sarif@v3` and `actions/upload-artifact@v4`, as shown in `examples/github-actions/veilforge.yml`. A workflow needs `contents: read` and `security-events: write`; fork pull-request workflows should not expose privileged secrets and should retain GitHub's default restricted token behavior.
