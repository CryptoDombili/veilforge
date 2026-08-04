// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract TreasuryOverload { event Supplier(bytes32 value); function publish(bytes32 supplierReference) external { emit Supplier(supplierReference); } function publish(address, bytes32 supplierReference) external { emit Supplier(supplierReference); } }
