// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
interface IPaymentCase6Receiver { function receiveReference(bytes32 value) external; }
contract PaymentCase6 {
    function forward(address receiver, bytes32 invoiceReference) external { IPaymentCase6Receiver(receiver).receiveReference(invoiceReference); }
}
