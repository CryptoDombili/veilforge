// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract CreditCase1 {
    bytes32 public collateralReference;
    constructor(bytes32 value) { collateralReference = value; }
}
