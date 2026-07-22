// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title VeilForgeReportRegistry
/// @notice Anchors deterministic VeilForge report metadata without storing source code.
contract VeilForgeReportRegistry {
    struct ReportRecord {
        bytes32 sourceHash;
        bytes32 reportHash;
        uint16 score;
        string reportURI;
        string scannerVersion;
        address publisher;
        uint64 publishedAt;
    }

    mapping(bytes32 projectId => ReportRecord latestReport) private reports;

    event ReportPublished(
        bytes32 indexed projectId,
        bytes32 indexed sourceHash,
        bytes32 indexed reportHash,
        uint16 score,
        string reportURI,
        string scannerVersion,
        address publisher
    );

    error InvalidScore(uint16 score);
    error EmptyHash();

    function publishReport(
        bytes32 projectId,
        bytes32 sourceHash,
        bytes32 reportHash,
        uint16 score,
        string calldata reportURI,
        string calldata scannerVersion
    ) external {
        if (projectId == bytes32(0) || sourceHash == bytes32(0) || reportHash == bytes32(0)) revert EmptyHash();
        if (score > 100) revert InvalidScore(score);

        reports[projectId] = ReportRecord({
            sourceHash: sourceHash,
            reportHash: reportHash,
            score: score,
            reportURI: reportURI,
            scannerVersion: scannerVersion,
            publisher: msg.sender,
            publishedAt: uint64(block.timestamp)
        });

        emit ReportPublished(projectId, sourceHash, reportHash, score, reportURI, scannerVersion, msg.sender);
    }

    function getLatestReport(bytes32 projectId) external view returns (ReportRecord memory) {
        return reports[projectId];
    }
}
