// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract PaymentShadowing {
    bytes32 private customerKycReference;
    event CustomerReference(bytes32 value);
    function publish(bytes32 customerKycReference) external { emit CustomerReference(customerKycReference); }
}
