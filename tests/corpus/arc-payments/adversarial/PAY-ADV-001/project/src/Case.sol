// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract PaymentComment {
    // payer amount emit delegatecall public storage
    uint256 private counter;
    function increment() external { counter += 1; }
}
