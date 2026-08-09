// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Vault is Ownable {
    uint256 private balance;

    function deposit(uint256 amount) external {
        balance += amount;
    }
}
