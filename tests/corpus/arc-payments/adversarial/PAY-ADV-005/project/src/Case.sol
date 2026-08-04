// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract PaymentOccurrences {
    event Amount(bytes32 value);
    function publish(bytes32 paymentAmount) external { emit Amount(paymentAmount); emit Amount(paymentAmount); }
}
