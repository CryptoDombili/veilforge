// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./lib/Helper.sol";

contract Vault {
    function value() external pure returns (uint256) {
        return Helper.value();
    }
}
