// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract PaymentCaseNegative3 {
    bytes32 private payeeReference;
    event Status(bytes32 value);
    function announce() external { emit Status(bytes32("READY")); }
}
