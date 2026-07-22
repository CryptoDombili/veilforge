# Arc proof registry

## Deployment

```text
Network: Arc Testnet
Chain ID: 5042002
Registry: 0xf8b1D03931f2c11B642259d9aB19cfA3351C0Bbc
Explorer: https://testnet.arcscan.app
```

Source: `contracts/contracts/VeilForgeReportRegistry.sol`.

## `publishReport`

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

The web app sends parameters in this exact order.

## Ownership behavior

The first submitter of a `projectId` becomes its owner in the registry. The same wallet may update the latest report. Another wallet cannot overwrite it.

## Privacy boundary

The registry stores hashes and report metadata only. A hash does not make public source private by itself; it only anchors the exact local artifact fingerprint. Do not attach a public report URI if the report contains information that should remain private.

## Verification

The contract source in this repository should be used for ArcScan Verify & Publish. Compiler target is Solidity `0.8.24`. Confirm optimizer settings from `contracts/hardhat.config.ts` before submitting verification.
