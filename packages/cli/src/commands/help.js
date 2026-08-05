import { EXIT_CODES } from '../exit-codes.js';
export const HELP_TEXT = `VeilForge V4 CLI

Commands:
  veilforge scan --project-id ID --source DIR --domain payments --output DIR
  veilforge verify-report FILE
  veilforge verify-export DIRECTORY
  veilforge gate --report FILE --config FILE
  veilforge gate --export DIRECTORY --config FILE

Scan options:
  --project-id ID                 Stable project identifier (required)
  --source DIR / --file FILE      Recursive directory or individual Solidity file
  --domain NAME                   payments, treasury, private-credit (repeatable)
  --stage-timeout MS              Per-stage timeout
  --global-timeout MS             Parent-enforced hard timeout
  --output DIR                    Explicit export directory
  --overwrite                     Replace an existing export set
  --json                          Emit one machine-readable JSON document
  --no-progress / --quiet         Disable progress output
  --include-operational-metadata  Include operational report metadata
  --no-export                     Do not write export files
  --sarif / --sarif-output FILE   Write verified SARIF 2.1.0
  --gate-config FILE              Evaluate the scan with a gate policy
  --baseline-report FILE          Verified prior report for new-only gating
  --gate-json                     Emit/write the deterministic gate result

Exit codes:
  ${EXIT_CODES.COMPLETED} completed  ${EXIT_CODES.ARGUMENT} arguments  ${EXIT_CODES.SOURCE} source  ${EXIT_CODES.SCAN_FAILED} scan failed
  ${EXIT_CODES.INCOMPLETE} incomplete  ${EXIT_CODES.TIMEOUT} timeout  ${EXIT_CODES.ABORTED} aborted
  ${EXIT_CODES.REPORT_INVALID} report invalid  ${EXIT_CODES.EXPORT_INVALID} export invalid
  ${EXIT_CODES.OUTPUT} output failure  ${EXIT_CODES.PROTOCOL} worker/protocol failure
  ${EXIT_CODES.GATE_FAILED} policy gate failed
`;
export function helpCommand() { return HELP_TEXT; }
