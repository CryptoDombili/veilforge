// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract CreditCaseNegative2 {
    function check(bytes32 collateralReference) internal pure returns (bool) { return collateralReference != bytes32(0); }
}
