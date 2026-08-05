import { scanProject } from 'veilforge';

const result = await scanProject({
  projectId: 'sdk-one-call',
  sources: { 'contracts/Vault.sol': { content: 'pragma solidity 0.8.24; contract Vault { uint256 public value; }' } },
});
console.log(JSON.stringify({ ok: result.ok, status: result.status, scanId: result.scanId }));
