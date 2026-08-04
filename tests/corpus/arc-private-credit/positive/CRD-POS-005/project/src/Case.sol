// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract CreditCase5 {
    error SensitiveReference(bytes32 value);
    function reject(bytes32 settlementReference) external pure { revert SensitiveReference(settlementReference); }
}
