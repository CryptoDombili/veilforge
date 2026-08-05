import { scanProject } from 'veilforge/scan';

const result = await scanProject({
  projectId: 'sdk-progress',
  sources: { 'Vault.sol': { content: 'pragma solidity 0.8.24; contract Vault {}' } },
}, { onProgress: ({ event, stage }) => console.log(event, stage ?? '') });
console.log(result.status);
