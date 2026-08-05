# Canonical Source and Report Hash

Status: normative for v4.0.0-gc.1.

## Canonical paths

1. Accept only project-relative paths.
2. Convert `\\` to `/`.
3. Remove leading `./` segments.
4. Resolve `.` segments and reject any `..` segment that could escape or alter the declared root.
5. Normalize path text to Unicode NFC.
6. Reject absolute POSIX paths, Windows drive paths, and UNC paths.
7. Sort paths by Unicode code-point order, not host locale.
8. Reject exact and case-folded collisions after normalization. Never silently overwrite a colliding source.

## Canonical source content

- Decode as strict UTF-8.
- Remove one leading UTF-8 BOM for canonical compilation and hashing.
- Convert CRLF and bare CR to LF.
- Preserve all other code points and whitespace exactly.
- Do not apply Unicode normalization to Solidity source contents because that could alter literals or identifiers.
- Preserve a separate raw input content hash when provenance requires exact submitted bytes.

The canonical source bundle is the canonical JSON object mapping sorted canonical paths to canonical source content. Its Keccak-256 domain is `veilforge:v4:canonical-source:1\0`.

## Canonical JSON

Objects are serialized with lexicographically sorted keys. Arrays retain their normative order. Numbers must be finite JSON numbers. Undefined values are forbidden. UTF-8 encoding is used without BOM.

## Policy hash

The canonical policy object is hashed with `veilforge:v4:policy:1\0`.

## Report hash

Before hashing:

- remove the top-level `reportHash` property;
- remove timestamps, hostname, absolute paths, execution duration, temporary paths, and nondeterministic diagnostics;
- sort findings by `findingId` then `occurrenceId`;
- include candidate version, report schema version, exact compiler version/build/settings, compiler input hash, canonical source hash, and policy hash.

The resulting canonical JSON is hashed with `veilforge:v4:report:1\0`.

Changing a hash algorithm, normalization rule, included field, or domain prefix requires a new identity-domain version.
