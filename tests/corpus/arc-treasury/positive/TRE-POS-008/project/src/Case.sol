// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract TreasuryCaseSink { event Routed(bytes32 value); function reveal(bytes32 value) external { emit Routed(value); } }
contract TreasuryCaseRouter { function route(address sink, bytes32 invoiceReference) external { TreasuryCaseSink(sink).reveal(invoiceReference); } }
