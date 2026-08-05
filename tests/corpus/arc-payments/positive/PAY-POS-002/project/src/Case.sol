// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract PaymentCase2 {
    event PayeeReferencePublished(bytes32 value);
    function publish(bytes32 payeeReference) external { emit PayeeReferencePublished(payeeReference); }
}
