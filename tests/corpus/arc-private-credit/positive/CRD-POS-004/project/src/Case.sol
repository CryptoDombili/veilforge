// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract CreditCase4 {
    mapping(address => bytes32) private interestRate;
    function read(address account) external view returns (bytes32) { return interestRate[account]; }
}
