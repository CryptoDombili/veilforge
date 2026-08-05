// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
interface IRiskReceiver { function receiveReference(bytes32 value) external; }
contract CreditCaseNegative6 {
    function forward(address receiver, bytes32 beneficiaryReference) external { IRiskReceiver(receiver).receiveReference(beneficiaryReference); }
}
