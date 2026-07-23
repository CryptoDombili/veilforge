# VeilForge Report Registry reference

`VeilForgeReportRegistry.sol` is the reference contract for Proof Center 2.0. It stores only hashes, a readiness score, optional report URI, scanner version, publisher, and timestamp. Solidity source code and full reports are never sent to the registry.

The canonical publication ABI is:

```solidity
publishReport(
    bytes32 projectId,
    bytes32 sourceHash,
    bytes32 reportHash,
    uint16 score,
    string reportURI,
    string scannerVersion
)
```

The browser encoder and unit tests use this exact argument order. The default Arc Testnet address configured in the web app is:

```text
0xf8b1D03931f2c11B642259d9aB19cfA3351C0Bbc
```

This source is included as an integration reference. Review and compile it with your normal Solidity toolchain before deploying a new registry instance.
