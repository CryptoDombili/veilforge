// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
contract TreasuryCase2 { event EmployeePayrollReferencePublished(bytes32 value); function publish(bytes32 employeePayrollReference) external { emit EmployeePayrollReferencePublished(employeePayrollReference); } }
