// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract PaymentCase1 {
    bytes32 public payerReference;
    constructor(bytes32 value) { payerReference = value; }
}
