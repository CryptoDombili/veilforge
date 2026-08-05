import { createScanSession, runScanStage, runRemainingStages } from 'veilforge/session';

let session = createScanSession({
  projectId: 'sdk-staged',
  sources: { 'Vault.sol': { content: 'pragma solidity 0.8.24; contract Vault {}' } },
});
session = await runScanStage(session, 'input-validation');
const result = await runRemainingStages(session);
console.log(JSON.stringify({ ok: result.ok, status: result.status }));
