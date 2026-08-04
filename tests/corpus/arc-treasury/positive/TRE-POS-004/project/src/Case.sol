// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract TreasuryCase4 { mapping(address => bytes32) private records; function read(address account) external view returns (bytes32) { return records[account]; } }
