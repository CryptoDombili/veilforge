// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract CreditKeccak {
    event LoanDigest(bytes32 value);
    function publish(bytes32 loanTerms) external { emit LoanDigest(keccak256(abi.encode(loanTerms))); }
}
