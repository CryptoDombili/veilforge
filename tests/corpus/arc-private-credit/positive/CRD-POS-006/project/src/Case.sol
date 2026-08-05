// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
interface ICreditCase6Receiver { function receiveReference(bytes32 value) external; }
contract CreditCase6 {
    function forward(address receiver, bytes32 beneficiaryReference) external { ICreditCase6Receiver(receiver).receiveReference(beneficiaryReference); }
}
