// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface ISettlementToken {
    function transfer(address recipient, uint256 amount) external returns (bool);
}
