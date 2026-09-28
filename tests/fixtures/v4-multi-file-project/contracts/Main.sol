// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Helper} from "./Helper.sol";

contract Main {
    uint256 public paymentAmount;

    function store(uint256 value) external {
        paymentAmount = Helper.normalize(value);
    }
}
