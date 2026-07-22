import { generatePolicyManifest, scanSources } from '@veilforge/scanner';

const report = scanSources([{
  path: 'Vault.sol',
  content: `pragma solidity ^0.8.24;
contract Vault {
  mapping(address => uint256) private balance;
  function getBalance(address account) external view returns (uint256) {
    return balance[account];
  }
}`,
}]);

console.log(JSON.stringify(generatePolicyManifest(report), null, 2));
