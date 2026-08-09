// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../utils/Context.sol";

abstract contract Ownable is Context {
    address internal owner;
}
