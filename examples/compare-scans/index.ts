import { compareReports, scanSources } from '@veilforge/scanner';

const before = scanSources([{
  path: 'Payroll.sol',
  content: 'pragma solidity ^0.8.24; contract Payroll { mapping(address => uint256) public salary; }',
}]);

const after = scanSources([{
  path: 'Payroll.sol',
  content: 'pragma solidity ^0.8.24; contract Payroll { mapping(address => uint256) private salary; }',
}]);

console.log(compareReports(before, after));
