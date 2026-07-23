# Arc Proof Registry Integration

## Registry contract

VeilForge uses the deployed `VeilForgeReportRegistry` interface on Arc Testnet.

```solidity
function publishReport(
    bytes32 projectId,
    bytes32 sourceHash,
    bytes32 reportHash,
    uint16 score,
    string calldata scannerVersion,
    string calldata reportURI
) external;
```

The two dynamic string arguments use the deployed order: **`scannerVersion` first, then `reportURI`**. Their Solidity types are identical, so the function selector is unchanged; the ABI tail order must still match exactly.

## Stored data

- source hash
- report hash
- score
- scanner version
- optional report URI
- publisher
- timestamp

The registry does not store Solidity source or the finding payload.

## Browser flow

1. Run a deterministic local scan.
2. Review project ID, hashes, score, scanner version, registry, and optional URI.
3. Connect an installed EIP-1193/EIP-6963 browser wallet.
4. Switch or add Arc Testnet.
5. Encode calldata locally using the deployed string order.
6. Simulate the contract call with `eth_call` to catch known reverts before gas is spent.
7. Submit `eth_sendTransaction` after simulation passes.
8. Poll the transaction receipt.
9. Show **Confirmed** only when the receipt status is successful; otherwise show the ArcScan failure link.

## Arc Testnet configuration

```text
Chain ID: 5042002
Hex chain ID: 0x4CEF52
RPC: https://rpc.testnet.arc.network
Explorer: https://testnet.arcscan.app
Currency: USDC
```
