// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ISettlementToken} from "../interfaces/ISettlementToken.sol";

contract ArcTreasury {
    ISettlementToken public immutable settlementToken;

    constructor(ISettlementToken token) {
        settlementToken = token;
    }

    function settle(address recipient, uint256 amount) external returns (bool) {
        return settlementToken.transfer(recipient, amount);
    }
}
