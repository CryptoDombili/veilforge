# V4 Arc Testnet Proof Acceptance — Phase 5C-3A

This checklist prepares a controlled Phase 5C-3B acceptance. Phase 5C-3A must not send a transaction.

- [ ] Build and open the V4 preview; confirm the production/default feature flag remains off.
- [ ] Install and unlock a compatible injected EVM wallet extension.
- [ ] Use a burner/testnet wallet only. Never enter or record a private key or seed phrase.
- [ ] Select Arc Testnet manually in the wallet.
- [ ] Confirm the expected chain ID is `5042002` (`0x4cef52`).
- [ ] Confirm the previously authorized account is visible before connecting.
- [ ] Produce and verify a fresh V4 report in the browser worker.
- [ ] Review the report hash, proof envelope version, schema and hash payload version.
- [ ] If the report is incomplete, review its reason codes and acknowledge the disclosure.
- [ ] Confirm the trusted Registry V2 address is `0x88B4055eaB061CEa9BdfefF524f65ff461B5401d`.
- [ ] Confirm registry runtime code and expected publish selector checks pass.
- [ ] Confirm duplicate lookup and registry-state binding completed.
- [ ] Confirm all blocking read-only preflight checks pass.
- [ ] Review network, account, target, report hash, method, zero value, calldata digest and gas-estimate status.
- [ ] Capture a source-free transaction review screenshot or acceptance notes; do not include wallet secrets.
- [ ] Confirm an explicit user action and review acknowledgement would be required for any future send.
- [ ] Confirm the UI says: **Transaction sending is disabled in this preflight build.**
- [ ] Confirm no transaction, signature request, network-switch request, deployment, publish or production rollout occurred in Phase 5C-3A.
