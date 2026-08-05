// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract TreasuryPath { event Operator(bytes32 value); function publish(bytes32 treasuryOperatorReference) external { emit Operator(treasuryOperatorReference); } }
