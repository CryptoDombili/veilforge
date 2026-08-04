// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract PaymentCaseNegative2 {
    function check(bytes32 payerReference) internal pure returns (bool) { return payerReference != bytes32(0); }
}
