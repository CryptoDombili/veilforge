# VeilForge Report Registry V2 reference

`VeilForgeReportRegistry.sol` is the publisher-scoped reference contract for Proof Center 3.2.2. It stores only hashes, a readiness score, optional report URI, scanner version, publisher, and timestamp. Solidity source code and full reports are never sent to the registry.

## Security model

Records are stored by both project ID and publisher address:

```solidity
reports[projectId][publisher]
```

A second wallet can publish under the same `projectId`, but it cannot replace another publisher's latest record.

## Publication ABI

The write ABI remains compatible with earlier VeilForge releases:

```solidity
publishReport(
    bytes32 projectId,
    bytes32 sourceHash,
    bytes32 reportHash,
    uint16 score,
    string scannerVersion,
    string reportURI
)
```

## Read API

```solidity
getLatestReport(bytes32 projectId, address publisher)
getMyLatestReport(bytes32 projectId)
hasReport(bytes32 projectId, address publisher)
```

The default Arc Testnet Registry V2 address configured in the web app is:

```text
0x88B4055eaB061CEa9BdfefF524f65ff461B5401d
```

Public constants:

```text
REGISTRY_VERSION = 2.0.0
PUBLISHER_SCOPED = true
```

This source is included as an integration reference. Review and compile it with your normal Solidity toolchain before deploying another registry instance.
