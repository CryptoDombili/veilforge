# Arc Testnet Proof Evidence

Status: **shipped and verified on Arc Testnet only**. No new transaction is authorized by this document.

## Canonical publication identity

| Field | Value |
|---|---|
| Network | Arc Testnet |
| Chain ID | `5042002` (`0x4cef52`) |
| Transaction | `0xdb674c986195ed9b3950f34d058637fbb2b887f58ca724400225ba177884192c` |
| Block | `55469453` |
| Publisher | `0x60B6333a0722bBEA39d4026b284Ae1E142bEb914` |
| Registry V2 | `0x88B4055eaB061CEa9BdfefF524f65ff461B5401d` |
| Method | `publishReport` |
| Value | `0 USDC` |
| Observed fee | `0.001175966 USDC` |
| Report hash | `sha256:fce5ffa529c79d185a6013a362e25658020d1691550557d59173c9acc6a417ea` |
| Explorer status | Success |

The observed fee is historical Testnet evidence. It is not a mainnet cost estimate, quote, cap, or guarantee.

## Verification performed

- Receipt status and transaction identity were fetched read-only and verified.
- Chain, trusted registry, publisher, and block matched the expected acceptance identity.
- The Registry V2 event was decoded and verified.
- The event report hash matched the verified V4 report hash.
- The persisted identity is marked provider-verified; stale/mock state is not accepted as live evidence.
- A post-publication publisher-scoped registry lookup returned `already-published`.
- The duplicate path retained the existing transaction identity, set `transactionRequest=null`, and produced no second `eth_sendTransaction` request.
- Refresh and history reopen restore only the verified identity.

## Evidence and reproduction

- Acceptance record: `docs/releases/v4-arc-testnet-proof-acceptance.md`
- Receipt normalization: `apps/web/v4/proof-receipt.js`
- Reconciliation boundary: `apps/web/v4/proof-transaction-acceptance.js`
- Persistence boundary: `apps/web/v4/proof-persistence.js`

Read-only reproduction command:

```powershell
npm.cmd run reconcile:web-v4-proof-arc-readonly
```

This command requires the configured public provider to remain available. If the provider or explorer is unavailable, use the stored acceptance document and transaction hash as historical evidence; do not fabricate a fresh result, use a mock receipt as live evidence, open a wallet, or send another transaction.

## Claim boundary

Registry proof anchors a report identity and publication event. It does not publish private source code, certify confidentiality, replace a security audit, make application data private, or imply Arc/Circle endorsement. Registry V2 allows a publisher to overwrite its latest project-scoped record; VeilForge therefore requires client-side identity reconciliation and duplicate protection.

