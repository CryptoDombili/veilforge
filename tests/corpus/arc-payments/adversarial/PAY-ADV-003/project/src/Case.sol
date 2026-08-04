// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract PaymentModifier {
    modifier onlyAnyone() { _; }
    event Beneficiary(bytes32 value);
    function publish(bytes32 beneficiaryReference) external onlyAnyone { emit Beneficiary(beneficiaryReference); }
}
