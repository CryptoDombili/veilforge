// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract CreditProxy {
    function forward(address implementation, bytes calldata loanTerms) external returns (bool ok) {
        (ok,) = implementation.delegatecall(loanTerms);
    }
}
