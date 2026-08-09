// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/access/Ownable.sol";
import "foo/Math.sol";

contract Vault is Ownable {
    function doubled(uint256 value) external pure returns (uint256) {
        return Math.twice(value);
    }
}
