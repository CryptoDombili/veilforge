// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title VeilForge Report Registry
/// @notice Anchors deterministic privacy-readiness report proofs on Arc Testnet.
/// @dev Stores hashes and metadata only. Source code and full findings remain offchain.
contract VeilForgeReportRegistry {
    error ZeroProjectId();
    error ZeroSourceHash();
    error ZeroReportHash();
    error ScoreOutOfRange(uint16 score);
    error ProjectOwnedByAnotherSubmitter(address currentOwner);

    struct Report {
        bytes32 sourceHash;
        bytes32 reportHash;
        uint16 score;
        string reportURI;
        address submitter;
        uint64 timestamp;
        string scannerVersion;
    }

    mapping(bytes32 projectId => Report report) private reports;

    event ReportPublished(
        bytes32 indexed projectId,
        address indexed submitter,
        bytes32 sourceHash,
        bytes32 reportHash,
        uint16 score,
        string reportURI,
        string scannerVersion,
        uint64 timestamp
    );

    /// @notice Publish or update a report for a project controlled by msg.sender.
    function publishReport(
        bytes32 projectId,
        bytes32 sourceHash,
        bytes32 reportHash,
        uint16 score,
        string calldata reportURI,
        string calldata scannerVersion
    ) external {
        if (projectId == bytes32(0)) revert ZeroProjectId();
        if (sourceHash == bytes32(0)) revert ZeroSourceHash();
        if (reportHash == bytes32(0)) revert ZeroReportHash();
        if (score > 100) revert ScoreOutOfRange(score);

        address currentOwner = reports[projectId].submitter;
        if (currentOwner != address(0) && currentOwner != msg.sender) {
            revert ProjectOwnedByAnotherSubmitter(currentOwner);
        }

        uint64 publishedAt = uint64(block.timestamp);
        reports[projectId] = Report({
            sourceHash: sourceHash,
            reportHash: reportHash,
            score: score,
            reportURI: reportURI,
            submitter: msg.sender,
            timestamp: publishedAt,
            scannerVersion: scannerVersion
        });

        emit ReportPublished(
            projectId,
            msg.sender,
            sourceHash,
            reportHash,
            score,
            reportURI,
            scannerVersion,
            publishedAt
        );
    }

    /// @notice Return the latest report for a project.
    function latestReport(bytes32 projectId)
        external
        view
        returns (
            bytes32 sourceHash,
            bytes32 reportHash,
            uint16 score,
            string memory reportURI,
            address submitter,
            uint64 timestamp,
            string memory scannerVersion
        )
    {
        Report storage report = reports[projectId];
        return (
            report.sourceHash,
            report.reportHash,
            report.score,
            report.reportURI,
            report.submitter,
            report.timestamp,
            report.scannerVersion
        );
    }
}
