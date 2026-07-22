# Arc Proof Registry Integration

## Registry contract

VeilForge v1.8 keeps compatibility with the deployed `VeilForgeReportRegistry` interface.

```solidity
function publishReport(
    bytes32 projectId,
    bytes32 sourceHash,
    bytes32 reportHash,
    uint16 score,
    string calldata reportURI,
    string calldata scannerVersion
) external;
```

Argument order is tested explicitly. `reportURI` precedes `scannerVersion`.

## Stored data

- source hash
- report hash
- score
- optional report URI
- submitter
- timestamp
- scanner version

The registry does not store Solidity source or the finding payload.

## Browser flow

1. Run a deterministic local scan.
2. Review project ID, hashes, score, version, registry, and optional URI.
3. Connect an EIP-1193 wallet.
4. Switch or add Arc Testnet through wallet methods.
5. Encode calldata locally.
6. Submit `eth_sendTransaction`.
7. Confirm the wallet transaction.
8. Open the ArcScan transaction link.

## Arc Testnet configuration

```text
Chain ID: 5042002
Hex chain ID: 0x4CF4B2
RPC: https://rpc.testnet.arc.network
Explorer: https://testnet.arcscan.app
Currency: USDC
```

Verify these values against current Arc documentation before production use.

## Registry ownership behavior

The reference contract lets the original submitter update a project ID. Another address cannot overwrite it. A new source bundle creates a new deterministic project ID in v1.8, so project lineage should be tracked through report history or an external URI when needed.
