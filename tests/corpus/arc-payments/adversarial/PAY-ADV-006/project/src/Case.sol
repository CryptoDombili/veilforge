// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract PaymentCrLf {
    event Settlement(bytes32 value);
    function publish(bytes32 settlementReference) external { emit Settlement(settlementReference); }
}
