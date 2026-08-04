// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract PaymentCase3 {
    function submit(bytes32 paymentAmount) external pure returns (bool) { return paymentAmount != bytes32(0); }
}
