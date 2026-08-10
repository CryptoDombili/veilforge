// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ArcTreasury} from "./treasury/ArcTreasury.sol";
import {PrivateCreditVault} from "./credit/PrivateCreditVault.sol";

contract PaymentRouter {
    ArcTreasury public immutable treasury;
    PrivateCreditVault public immutable creditVault;

    event PaymentRouted(bytes32 indexed paymentReference, address indexed recipient, uint256 amount);

    constructor(ArcTreasury treasury_, PrivateCreditVault creditVault_) {
        treasury = treasury_;
        creditVault = creditVault_;
    }

    function route(bytes32 paymentReference, address recipient, uint256 amount) external {
        require(treasury.settle(recipient, amount), "settlement failed");
        creditVault.recordDraw(paymentReference, amount);
        emit PaymentRouted(paymentReference, recipient, amount);
    }
}
