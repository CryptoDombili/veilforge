// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract PaymentCase5 {
    error SensitiveReference(bytes32 value);
    function reject(bytes32 customerKycReference) external pure { revert SensitiveReference(customerKycReference); }
}
