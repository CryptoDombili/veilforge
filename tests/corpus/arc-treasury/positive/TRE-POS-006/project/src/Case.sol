// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
interface ITreasuryCase6Receiver { function receiveReference(bytes32 value) external; }
contract TreasuryCase6 { function forward(address receiver, bytes32 beneficiaryReference) external { ITreasuryCase6Receiver(receiver).receiveReference(beneficiaryReference); } }
