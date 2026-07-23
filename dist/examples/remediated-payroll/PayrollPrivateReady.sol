// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PayrollPrivateReady {
    error Unauthorized();
    error MissingRecord();

    address private immutable payrollAdmin;
    mapping(address => uint256) private salaryByEmployee;
    mapping(address => bytes32) private identityCommitmentByEmployee;

    event BatchCommitmentPublished(bytes32 indexed batchCommitment, uint256 recordCount);

    modifier onlyPayrollAdmin() {
        if (msg.sender != payrollAdmin) revert Unauthorized();
        _;
    }

    constructor() {
        payrollAdmin = msg.sender;
    }

    function setEmployeeSalary(address employee, uint256 salary) external onlyPayrollAdmin {
        salaryByEmployee[employee] = salary;
    }

    function setIdentityCommitment(address employee, bytes32 identityCommitment) external onlyPayrollAdmin {
        identityCommitmentByEmployee[employee] = identityCommitment;
    }

    function viewMySalary() external view returns (uint256) {
        uint256 salary = salaryByEmployee[msg.sender];
        if (salary == 0) revert MissingRecord();
        return salary;
    }

    function publishBatchCommitment(bytes32 batchCommitment, uint256 recordCount) external onlyPayrollAdmin {
        emit BatchCommitmentPublished(batchCommitment, recordCount);
    }
}
