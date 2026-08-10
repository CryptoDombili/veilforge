// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ArcPaymentsDemo
/// @notice Simple test contract for VeilForge scanning on Arc.
/// @dev Deliberately includes several privacy/exposure patterns for scanner testing.
contract ArcPaymentsDemo {
    address public owner;

    struct Payment {
        address payer;
        address recipient;
        uint256 amount;
        bytes32 paymentReference;
        string memo;
        uint256 timestamp;
    }

    Payment[] public payments;

    mapping(address => uint256) public totalPaid;
    mapping(address => uint256) public totalReceived;

    event PaymentRecorded(
        address indexed payer,
        address indexed recipient,
        uint256 amount,
        bytes32 indexed paymentReference,
        string memo
    );

    event TreasurySweep(
        address indexed operator,
        address indexed destination,
        uint256 amount
    );

    constructor() {
        owner = msg.sender;
    }

    function recordPayment(
        address recipient,
        uint256 amount,
        bytes32 paymentReference,
        string calldata memo
    ) external {
        require(recipient != address(0), "zero recipient");
        require(amount > 0, "zero amount");

        payments.push(
            Payment({
                payer: msg.sender,
                recipient: recipient,
                amount: amount,
                paymentReference: paymentReference,
                memo: memo,
                timestamp: block.timestamp
            })
        );

        totalPaid[msg.sender] += amount;
        totalReceived[recipient] += amount;

        emit PaymentRecorded(
            msg.sender,
            recipient,
            amount,
            paymentReference,
            memo
        );
    }

    function paymentCount() external view returns (uint256) {
        return payments.length;
    }

    function getPayment(uint256 index)
        external
        view
        returns (
            address payer,
            address recipient,
            uint256 amount,
            bytes32 paymentReference,
            string memory memo,
            uint256 timestamp
        )
    {
        Payment storage p = payments[index];

        return (
            p.payer,
            p.recipient,
            p.amount,
            p.paymentReference,
            p.memo,
            p.timestamp
        );
    }

    function treasurySweep(
        address payable destination,
        uint256 amount
    ) external {
        require(msg.sender == owner, "not owner");
        require(destination != address(0), "zero destination");
        require(address(this).balance >= amount, "insufficient balance");

        destination.transfer(amount);

        emit TreasurySweep(msg.sender, destination, amount);
    }

    receive() external payable {}
}
