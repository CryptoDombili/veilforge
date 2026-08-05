import { scanProject } from 'veilforge/scan';

const controller = new AbortController();
controller.abort('example cancellation');
const result = await scanProject({
  projectId: 'sdk-timeout-abort',
  sources: { 'Vault.sol': { content: 'pragma solidity 0.8.24; contract Vault {}' } },
}, { globalTimeoutMs: 5_000, signal: controller.signal, throwOnError: false });
console.log(JSON.stringify({ status: result.status, partial: Boolean(result.stageSummary) }));
