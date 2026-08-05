// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract CreditCaseSink {
    event Routed(bytes32 value);
    function reveal(bytes32 value) external { emit Routed(value); }
}
contract CreditCaseRouter {
    function route(address sink, bytes32 loanMetadataReference) external {
        CreditCaseSink(sink).reveal(loanMetadataReference);
    }
}
