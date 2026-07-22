// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SettlementRail {
    address public operator;
    mapping(address => uint256) private paidAmount;

    error Unauthorized();

    constructor() {
        operator = msg.sender;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert Unauthorized();
        _;
    }

    function settle(address employee, uint256 salary, string calldata memo) external onlyOperator {
        paidAmount[employee] += salary;
        bytes32 memoCommitment = keccak256(bytes(memo));
        memoCommitment;
    }

    function viewMyPaidAmount() external view returns (uint256) {
        return paidAmount[msg.sender];
    }
}
