// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract PaymentCase4 {
    mapping(address => bytes32) private beneficiary;
    function read(address account) external view returns (bytes32) { return beneficiary[account]; }
}
