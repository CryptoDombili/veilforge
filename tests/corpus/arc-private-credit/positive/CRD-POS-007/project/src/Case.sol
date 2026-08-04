// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract CreditCase7 {
    function metadataURI(bytes32 loanMetadataReference) external pure returns (string memory) {
        return string(abi.encodePacked("data:application/octet-stream,", loanMetadataReference));
    }
}
