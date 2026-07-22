# Detection rules

Each built-in rule is explainable and produces source evidence, confidence, impact, remediation and a suggested policy boundary.

## `VF000` — parse integrity

Emitted when a source file cannot be parsed. Analysis is incomplete, so the finding is critical and the project is deployment blocked.

## `VF001` — sensitive public state

Detects non-mapping public state whose name or type contains configured sensitive terms. Public Solidity state creates an automatic getter.

## `VF002` — sensitive event schema

Detects event names or parameters associated with financial, identity or operational data.

## `VF003` — sensitive revert text

Detects `require` or `revert` string literals containing sensitive terms.

## `VF004` — unguarded sensitive read

Detects public/external read functions that appear to return or derive sensitive information without a recognizable authorization guard.

## `VF005` — unguarded sensitive write

Detects public/external state-changing functions in sensitive contexts without a recognizable guard. Common permissionless verbs reduce severity when intent may be legitimate.

## `VF006` — low-level call surface

Detects `.call`, `.staticcall`, `.delegatecall` and `.callcode`. Delegate-style calls are treated more severely.

## `VF007` — sensitive cross-contract flow

Detects sensitive values passed into typed external contract calls.

## `VF008` — public mapping

Detects public mappings. Known keys can be queried through compiler-generated getters.

## `VF009` — unrestricted administrative mutation

Detects public/external administrative setters without a recognizable guard.

## `VF010` — `tx.origin` authorization

Detects `tx.origin`, which creates ambiguous caller trust and phishing risk.

## `VF011` — sensitive event emission

Detects sensitive runtime values used in `emit` expressions.

## `VF012` — sensitive dynamic calldata

Detects sensitive `string calldata` and `bytes calldata` parameters.

## Sensitive vocabulary

The built-in semantic vocabulary lives in `packages/scanner/src/constants.ts`. Semantic-name findings are heuristics and include confidence metadata.

## Access-control recognition

The scanner recognizes common owner, role and authorization patterns plus project-specific `only*`, `require*` and `when*` modifiers.

## False-positive discipline

A new built-in rule should include:

- a positive fixture
- a negative fixture
- explicit confidence
- a documented boundary
- deterministic evidence
- an actionable remediation playbook
