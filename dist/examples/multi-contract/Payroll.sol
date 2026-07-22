// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISettlementRail {
    function settle(address employee, uint256 salary, string calldata memo) external;
}

contract PayrollMission {
    address public owner;
    mapping(address => uint256) public salaryByEmployee;
    ISettlementRail public settlementRail;

    event SalaryPaid(address indexed employee, uint256 salary, string memo);

    constructor(address rail) {
        owner = msg.sender;
        settlementRail = ISettlementRail(rail);
    }

    function setEmployeeSalary(address employee, uint256 salary) external {
        salaryByEmployee[employee] = salary;
    }

    function viewSalary(address employee) external view returns (uint256) {
        return salaryByEmployee[employee];
    }

    function payEmployee(address employee, string calldata memo) external {
        uint256 salary = salaryByEmployee[employee];
        settlementRail.settle(employee, salary, memo);
        emit SalaryPaid(employee, salary, memo);
    }
}
