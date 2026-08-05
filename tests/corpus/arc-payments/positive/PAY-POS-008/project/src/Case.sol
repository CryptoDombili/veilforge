// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract PaymentCaseSink {
    event Routed(bytes32 value);
    function reveal(bytes32 value) external { emit Routed(value); }
}
contract PaymentCaseRouter {
    function route(address sink, bytes32 settlementReference) external {
        PaymentCaseSink(sink).reveal(settlementReference);
    }
}
