// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract PrivateCreditVault {
    mapping(bytes32 facilityId => uint256 outstanding) public outstandingByFacility;

    function recordDraw(bytes32 facilityId, uint256 amount) external {
        outstandingByFacility[facilityId] += amount;
    }
}
