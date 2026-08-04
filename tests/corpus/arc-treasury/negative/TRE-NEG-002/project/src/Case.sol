// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract TreasuryCaseNegative2 { function check(bytes32 treasuryOperatorReference) internal pure returns (bool) { return treasuryOperatorReference != bytes32(0); } }
