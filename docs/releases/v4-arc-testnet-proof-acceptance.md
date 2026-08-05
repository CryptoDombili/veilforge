# V4 Arc Testnet Proof Acceptance — Phase 5C-3B

This checklist is the user-controlled transaction acceptance boundary. Automated validation uses mock providers only. Do not share a private key or seed phrase, and do not use a primary wallet.

Build with `npm.cmd run build:web-v4-preview`, start with `npm.cmd run serve:web-v4-preview`, then open `http://127.0.0.1:4174/` in a browser with the burner wallet extension installed.

- [ ] A dedicated burner/testnet wallet is being used.
- [ ] Arc Testnet is selected manually in the wallet.
- [ ] The expected chain ID is `5042002` (`0x4cef52`).
- [ ] The connected account shown in the review is correct.
- [ ] A fresh V4 report was produced and its integrity is verified.
- [ ] The proof envelope is verified and matches the displayed report hash.
- [ ] The trusted Registry V2 address is `0x88B4055eaB061CEa9BdfefF524f65ff461B5401d`.
- [ ] Registry runtime code and the expected publish selector checks passed.
- [ ] All blocking read-only preflight checks passed.
- [ ] The transaction review was opened and inspected before publication was enabled.
- [ ] Network, chain, account, target, contract version, report hash, schema, hash payload, envelope version and completeness are correct.
- [ ] Value is exactly `0x0`; gas estimate is shown honestly as an estimate or unavailable.
- [ ] The shortened calldata, calldata digest and duplicate status were reviewed.
- [ ] If analysis is incomplete, every displayed reason code was reviewed and the disclosure was acknowledged.
- [ ] The user clicked **Publish Proof** as a separate second wallet gesture.
- [ ] The user—not Codex or automation—approved the wallet popup.
- [ ] The returned transaction hash was recorded without wallet secrets.
- [ ] The receipt status succeeded on Arc Testnet.
- [ ] The trusted Registry V2 event report hash and publisher match the proof and connected account.
- [ ] The validated ArcScan transaction link opened at the expected transaction.
- [ ] A repeated preflight returned `already-published` with the existing transaction identity and explorer link.
- [ ] The duplicate attempt produced no second `eth_sendTransaction` request.
- [ ] No private key, seed phrase, source code, raw provider error or raw receipt was logged or persisted.

Stop before the Publish Proof click unless the user is present, has reviewed every field above, and explicitly elects to continue. The production V4 feature flag remains off.

## Phase 5C-3B acceptance evidence

- Transaction: `0xdb674c986195ed9b3950f34d058637fbb2b887f58ca724400225ba177884192c`
- Block: `55469453`
- Publisher: `0x60B6333a0722bBEA39d4026b284Ae1E142bEb914`
- Registry: `0x88B4055eaB061CEa9BdfefF524f65ff461B5401d`
- Event/report hash: `sha256:fce5ffa529c79d185a6013a362e25658020d1691550557d59173c9acc6a417ea`
- Read-only reconciliation: receipt/event verified; publisher-scoped `hasReport` is true; no second transaction was sent.

The updated preview must reconcile this public transaction hash once to replace any legacy/mock/stale browser proof state with the provider-verified V2 persistence record. Subsequent refresh and history reopen restore only that verified identity.
