# Source, Sink, and Declassification Specification

Status: normative for v4.0.0-gc.1.

## Sources

A source is financial data identified by an explicit policy label, a supported financial ABI/model, or a supported dataflow origin. Identifier names may add evidence but cannot be the sole basis for a high-confidence conclusion.

## Sinks

The normative sink identifiers are:

- `public-storage-getter`
- `event`
- `calldata`
- `return`
- `revert-custom-error`
- `external-call`
- `metadata-uri`

Every positive finding must identify at least one source, one sink, and the trace connecting them. A public calldata finding may use the public/external ABI entry itself as both the observable boundary and sink.

### Calldata observation semantics

Public or external ABI membership is a compiler-backed fact, but it is not by itself a privacy-relevant observation. A calldata observation requires a supported financial source classification. An identifier heuristic without financial context, an explicit policy label, or a taxonomy alias is insufficient.

One ABI parameter produces at most one semantic calldata occurrence per detector, financial data class, callable, contract, and policy disposition. Declaration, reference, and dataflow-path variants are supporting traces of that occurrence; they are merged deterministically and do not produce separate findings.

When the same raw parameter is already represented by a stronger disclosure boundary such as an event, external call, metadata URI, revert, raw return, or public storage exposure, the redundant calldata observation is omitted. A derived expression such as a boolean comparison is not a raw disclosure and does not hide the ABI observation. Filtering never changes source labels, accepted-risk records, approved-public decisions, or the oracle.

Compiler-backed ABI evidence remains complete when unrelated downstream analysis is incomplete. Genuine source, sink, trace, policy, or budget uncertainty continues to be represented as incomplete.

## Approved declassification

Only these mechanisms may declassify data:

1. A commitment or encryption wrapper explicitly approved by the active policy, including its fully qualified callable identity and scope.
2. A field explicitly declared intentionally public by the active policy.
3. A non-expired accepted-risk record containing owner, justification, scope, and expiry.

Names containing `hash`, `encrypt`, `private`, `commitment`, or similar terms have no declassification effect by themselves. Plain `keccak256` is not an approved privacy transform by default.

## Accepted-risk requirements

An accepted-risk record is invalid unless all of these fields are present and non-empty:

- `id`
- `owner`
- `justification`
- `scope`
- `expiresAt`

Expiry must be an RFC 3339 timestamp later than the evaluation time. An accepted risk changes the policy disposition; it does not erase the underlying finding or trace.

## Precedence

Explicit policy labels override name inference. An invalid or expired declassification record is ignored and reported as a policy error. Unknown wrappers do not declassify data.
