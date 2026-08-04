// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
abstract contract TreasuryBase { function publish(bytes32 value) external virtual; }
contract TreasuryOverride is TreasuryBase { event Beneficiary(bytes32 value); function publish(bytes32 beneficiaryReference) external override { emit Beneficiary(beneficiaryReference); } }
