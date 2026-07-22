// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title VeilForgeReportRegistry
/// @notice Anchors deterministic VeilForge report metadata without storing source code.
/// @dev The deployed Arc Testnet registry expects scannerVersion before reportURI.
contract VeilForgeReportRegistry {
    struct ReportRecord {
        bytes32 sourceHash;
        bytes32 reportHash;
        uint16 score;
        string scannerVersion;
        string reportURI;
        address publisher;
        uint64 publishedAt;
    }

    mapping(bytes32 projectId => ReportRecord latestReport) private reports;

    event ReportPublished(
        bytes32 indexed projectId,
        bytes32 indexed sourceHash,
        bytes32 indexed reportHash,
        uint16 score,
        string scannerVersion,
        string reportURI,
        address publisher
    );

    error InvalidScore(uint16 score);
    error EmptyHash();
    error EmptyScannerVersion();

    function publishReport(
        bytes32 projectId,
        bytes32 sourceHash,
        bytes32 reportHash,
        uint16 score,
        string calldata scannerVersion,
        string calldata reportURI
    ) external {
        if (projectId == bytes32(0) || sourceHash == bytes32(0) || reportHash == bytes32(0)) revert EmptyHash();
        if (score > 100) revert InvalidScore(score);
        if (bytes(scannerVersion).length == 0) revert EmptyScannerVersion();

        reports[projectId] = ReportRecord({
            sourceHash: sourceHash,
            reportHash: reportHash,
            score: score,
            scannerVersion: scannerVersion,
            reportURI: reportURI,
            publisher: msg.sender,
            publishedAt: uint64(block.timestamp)
        });

        emit ReportPublished(projectId, sourceHash, reportHash, score, scannerVersion, reportURI, msg.sender);
    }

    function getLatestReport(bytes32 projectId) external view returns (ReportRecord memory) {
        return reports[projectId];
    }
}
