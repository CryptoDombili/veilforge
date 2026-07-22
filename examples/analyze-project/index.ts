import { scanSources, type SourceFile } from '@veilforge/scanner';

const files: SourceFile[] = [
  {
    path: 'Payroll.sol',
    content: `pragma solidity ^0.8.24;
contract Payroll {
  mapping(address => uint256) public salary;
  function setSalary(address employee, uint256 amount) external {
    salary[employee] = amount;
  }
}`,
  },
];

const report = scanSources(files);
console.log({
  readiness: report.score,
  status: report.triage.status,
  contracts: report.contracts,
  exposureChains: report.exposureChains,
});
