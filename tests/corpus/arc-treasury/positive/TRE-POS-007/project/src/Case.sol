// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract TreasuryCase7 { function metadataURI(bytes32 invoiceReference) external pure returns (string memory) { return string(abi.encodePacked("data:application/octet-stream,", invoiceReference)); } }
