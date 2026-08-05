# V4 proof legacy compatibility

Phase 5C-1 adds V4 support without migrating or rewriting old proof material.

## Version routing

| Input | Detection result | Verification behavior |
| --- | --- | --- |
| V3 Proof Lab snapshot | `v3-legacy` | Existing proof and report hashes are validated in place |
| V3 registry payload | `v3-registry-legacy` | Existing bytes32 fields, score range, and scanner version are validated in place |
| Report schema 4.0.0 + hash payload v1 | `v4-report-legacy` | Legacy schema and canonical report integrity are recomputed |
| Proof envelope V4.1 + schema 4.1.0 + hash payload v2 | `v4` | Current envelope digest and trusted network metadata are verified |
| Unknown/future version | unsupported | Fails closed; no guessed migration |

V3 data remains in its existing namespace and is never converted to a V4 envelope automatically. Hashes are never rewritten. The existing V3 web proof modules and Registry V2 publication client are unchanged.

## Contract reads

Registry V2 records remain readable through the existing ABI. V4 uses the same ABI with an off-chain version token and a neutral legacy score. Publisher scoping is preserved. A legacy record is verified according to its own version rather than being interpreted as V4.

## Security boundary

Version detection is explicit. A legacy payload cannot opt into V4 merely by adding a client-side `verified` flag, and a V4 envelope cannot downgrade to the schema 4.0.0 / hash-v1 path. Unknown versions fail closed.
