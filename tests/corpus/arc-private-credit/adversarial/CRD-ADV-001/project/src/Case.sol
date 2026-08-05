// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract CreditAssembly {
    bytes32 public collateralReference;
    function store(bytes32 value) external { assembly { sstore(0, value) } }
}
