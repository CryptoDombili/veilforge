// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBenefitsProvider {
    function syncEmployee(address employee, uint256 salary, string calldata medicalMemo) external;
}

contract Payroll {
    address public owner;
    mapping(address => uint256) public salaryOf;
    mapping(address => bytes32) public employeeIdentity;
    string public payrollMemo;

    event SalaryPaid(address indexed employee, uint256 amount, string payrollMemo);
    event EmployeeIdentityUpdated(address indexed employee, bytes32 identity);

    IBenefitsProvider public benefitsProvider;

    constructor(address provider) {
        owner = msg.sender;
        benefitsProvider = IBenefitsProvider(provider);
    }

    function setEmployeeSalary(address employee, uint256 salary) external {
        salaryOf[employee] = salary;
    }

    function updateEmployeeIdentity(address employee, bytes32 identity) external {
        employeeIdentity[employee] = identity;
    }

    function getSalary(address employee) external view returns (uint256) {
        require(salaryOf[employee] > 0, "employee salary record does not exist");
        return salaryOf[employee];
    }

    function submitMedicalMemo(address employee, string calldata medicalMemo) external {
        benefitsProvider.syncEmployee(employee, salaryOf[employee], medicalMemo);
    }

    function paySalary(address employee, string calldata payrollMemo_) external {
        uint256 amount = salaryOf[employee];
        (bool ok,) = employee.call{value: amount}("");
        require(ok, "salary payment failed for employee");
        emit SalaryPaid(employee, amount, payrollMemo_);
    }

    function debugDumpPayroll() external view returns (string memory) {
        return payrollMemo;
    }

    function authorizeByOrigin() external view returns (bool) {
        return tx.origin == owner;
    }

    receive() external payable {}
}
