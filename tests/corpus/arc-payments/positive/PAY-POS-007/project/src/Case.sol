// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract PaymentCase7 {
    function metadataURI(bytes32 settlementReference) external pure returns (string memory) {
        return string(abi.encodePacked("data:application/octet-stream,", settlementReference));
    }
}
