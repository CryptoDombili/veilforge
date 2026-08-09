// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./nested/Math.sol";

library Helper {
    function value() internal pure returns (uint256) {
        return Math.one();
    }
}
