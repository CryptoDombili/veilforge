import { createV4ProofEnvelope, prepareRegistryPublish, verifyV4ProofEnvelope } from '../packages/proof/v4/index.js';
import { report } from '../tests/v4/report/helpers.mjs';

const verifiedReport = report();
const envelope = createV4ProofEnvelope(verifiedReport);
verifyV4ProofEnvelope(envelope);
const preflight = prepareRegistryPublish(envelope, {
  report: verifiedReport,
  providerChainId: 5_042_002,
  account: '0x1111111111111111111111111111111111111111',
  signerAvailable: true,
});
if (preflight.status !== 'ready' || !preflight.transactionRequest?.data?.startsWith('0x6133eb3a')) {
  throw new Error('V4 proof preflight smoke failed.');
}
process.stdout.write(JSON.stringify({ status: 'passed', transactionSent: false, reportHash: envelope.reportHash }));
