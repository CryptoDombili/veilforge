# Solidity import-resolution boundary

VeilForge V4 resolves documented project-local Solidity dependency patterns before invoking exact `solc 0.8.24`. The CLI filesystem collector and browser folder adapter feed the same deterministic virtual resolver; neither path fetches missing source over a network.

## Supported patterns

- relative imports whose normalized target remains inside the project virtual root;
- package imports resolved only from the scanned project's own `node_modules/` directory;
- Foundry `lib/` sources;
- deterministic `prefix=target` entries in a project-root `remappings.txt`;
- nested/transitive imports and import cycles.

The browser can resolve only files actually included in the selected folder. A Foundry browser scan must include `remappings.txt` and the referenced `lib/` Solidity files. Package imports require the corresponding project-local dependency Solidity files to be present in the selected folder. Browser code cannot inspect host directories or install packages.

`foundry.toml` remapping discovery is not implemented. Context-qualified remappings, network imports, runtime package installation, parent/global `node_modules` lookup, absolute imports, and imports outside the project root are unsupported and fail closed. This is bounded support for the documented project-local patterns, not a claim to support every Hardhat or Foundry project.

## Filesystem security model

The CLI accepts source entrypoints beneath its explicit current project root. Dependency reads are derived from normalized import paths and are limited to that root, including its project-local `node_modules/` and `lib/` trees. Lexical containment is checked before access and canonical realpath containment is checked before reading. A symlink, junction, or reparse path resolving outside the project root is rejected without returning escaped file content or an absolute path in the public diagnostic.

Missing, unsafe, ambiguous, or excessive dependency graphs stop before a successful scan. Structured resolution reasons include `MISSING_IMPORT`, `UNSUPPORTED_IMPORT_SCHEME`, `PATH_ESCAPE`, `SYMLINK_ESCAPE`, `AMBIGUOUS_IMPORT`, `LIMIT_EXCEEDED`, and `INVALID_REMAPPING`.

## Resource limits

| Boundary | CLI default | Browser maximum |
|---|---:|---:|
| Resolved Solidity files | 1,024 | 100 |
| Individual source bytes | 2 MiB | 512 KiB |
| Total resolved source bytes | 20 MiB | 1 MiB |
| Import depth | 64 | 64 |
| Remapping entries | 64 | 64 |
| Remapping text | 16 KiB | 16 KiB |
| Import specifier | 1,024 UTF-8 bytes | 1,024 UTF-8 bytes |

Limits are enforced on the fully resolved closure. VeilForge does not truncate an import graph and report the partial result as complete.

## Determinism and provenance

Canonical compiler source identifiers use normalized project-relative virtual paths, not host roots, selected browser-folder names, or usernames. Browser folder intake strips exactly its single browser-supplied selection root and rejects mixed roots before resolution. Collections and imports are sorted by code-point order, paths use `/`, and existing source-content normalization handles BOM and line endings. Resolution provenance distinguishes `project`, `relative-dependency`, `node_modules`, `foundry-lib`, and `foundry-remapping`; it is operational adapter metadata and is not added to the compatibility-sensitive report-hash payload.

Browser reports created by earlier builds may retain the selected folder name in their source identifiers. Those historical reports and proof envelopes remain self-contained and independently verifiable; new scans use the project-relative identity above without reinterpreting or rewriting historical artifacts.

No import-resolution path uploads Solidity, contacts a package registry, calls RPC, or emits source through telemetry.
