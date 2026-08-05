# Finding and Occurrence Identity

Status: normative for v4.0.0-gc.1.

## Identity split

`findingId` identifies a semantic disclosure class. `occurrenceId` identifies one concrete occurrence of that semantic disclosure. Two identical sink statements in the same callable must have one shared `findingId` only when their semantic trace is the same, but they must always retain distinct `occurrenceId` values and distinct locations.

## findingId input

The v1 finding identity payload contains, in this exact order:

1. rule ID;
2. fully qualified contract name;
3. callable signature;
4. source class;
5. sink class;
6. semantic anchor; and
7. trace hash.

The payload is canonical JSON and is hashed with Keccak-256 after the UTF-8 domain prefix `veilforge:v4:finding:1\0`.

Line numbers, timestamps, hostnames, execution time, and absolute paths are forbidden finding identity inputs.

## occurrenceId input

The occurrence payload contains:

1. `findingId`;
2. canonical project-relative path;
3. sink start byte;
4. sink end byte; and
5. zero-based semantic occurrence ordinal.

It is hashed with Keccak-256 after `veilforge:v4:occurrence:1\0`.

## Stability requirements

- Inserting unrelated lines before a finding may move its location but must not change `findingId`.
- Two concrete occurrences must never collapse into one report entry.
- Normalized paths are repository-relative and use `/`.
- AST numeric IDs are not stable identity inputs.
- A rule-version change that changes semantics requires a new rule ID or identity-domain version.
