# ADR-0003: Explicit declassification only

- Status: Accepted
- Applies to: VeilForge v4.0.0-gc.1

## Decision

Names such as `hash`, `encrypt`, `private`, and `commitment` do not declassify data. Plain `keccak256` does not establish financial privacy.

Only these policy-backed mechanisms can change disposition:

1. An explicitly approved commitment or encryption wrapper identified by fully qualified callable and scope.
2. A field explicitly declared intentionally public.
3. A valid accepted-risk record with owner, justification, scope, and expiry.

Accepted risk preserves the finding and trace. It only records the gate disposition. Expired, incomplete, or out-of-scope records have no effect.

## Consequences

Unknown transforms remain tainted. Policy errors fail closed. Detector output must explain which exact policy entry, if any, changed the disposition.
