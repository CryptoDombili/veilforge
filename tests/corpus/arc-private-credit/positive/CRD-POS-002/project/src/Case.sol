// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract CreditCase2 {
    event LoanTermsPublished(bytes32 value);
    function publish(bytes32 loanTerms) external { emit LoanTermsPublished(loanTerms); }
}
