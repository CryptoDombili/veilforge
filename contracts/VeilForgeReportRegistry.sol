// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title VeilForgeReportRegistry
/// @notice Anchors deterministic VeilForge report metadata without storing source code.
/// @dev Reports are publisher-scoped: the same projectId can be used by multiple
///      publishers without allowing one publisher to overwrite another's record.
///      The publication ABI keeps scannerVersion before reportURI.
contract VeilForgeReportRegistry {
    string public constant REGISTRY_VERSION = "2.0.0";
    bool public constant PUBLISHER_SCOPED = true;

    struct ReportRecord {
        bytes32 sourceHash;
        bytes32 reportHash;
        uint16 score;
        string scannerVersion;
        string reportURI;
        address publisher;
        uint64 publishedAt;
    }

    mapping(bytes32 projectId => mapping(address publisher => ReportRecord latestReport)) private reports;

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

        reports[projectId][msg.sender] = ReportRecord({
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

    /// @notice Returns a publisher's latest report for a project namespace.
    function getLatestReport(bytes32 projectId, address publisher) external view returns (ReportRecord memory) {
        return reports[projectId][publisher];
    }

    /// @notice Convenience getter for the caller's own project namespace.
    function getMyLatestReport(bytes32 projectId) external view returns (ReportRecord memory) {
        return reports[projectId][msg.sender];
    }

    /// @notice Returns whether a publisher has written a report for the project.
    function hasReport(bytes32 projectId, address publisher) external view returns (bool) {
        return reports[projectId][publisher].publishedAt != 0;
    }
}
