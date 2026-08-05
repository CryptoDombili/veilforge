import fs from 'node:fs';
import { createWebProofEnvelope, prepareWebRegistryPublish } from '../apps/web/v4/proof-adapter.js';
import { proofSectionTemplate, renderProofSummary } from '../apps/web/v4/proof-ui.js';
import { verifyV4Report } from '../apps/web/v4/report-adapter.js';
import { report } from '../tests/v4/report/helpers.mjs';

const verification = await verifyV4Report(report());
const envelope = await createWebProofEnvelope(verification);
const preflight = await prepareWebRegistryPublish({
  verification,
  envelope,
  walletState: { providerAvailable: true, connected: true, account: '0x1111111111111111111111111111111111111111', accounts: ['0x1111111111111111111111111111111111111111'], chainId: 5_042_002 },
});
const template = proofSectionTemplate();
const summary = renderProofSummary(envelope);
const sources = ['apps/web/v4/proof-wallet.js', 'apps/web/v4/proof-adapter.js', 'apps/web/v4/proof-lifecycle.js'].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
if (!template.includes('v4-proof-status') || !summary.includes(envelope.reportHash) || preflight.status !== 'ready-to-publish' || /eth_sendTransaction|eth_requestAccounts|wallet_switchEthereumChain/u.test(sources)) throw new Error('V4 web proof UI smoke failed.');
console.log(JSON.stringify({ passed: true, status: preflight.status, transactionSent: false, reportHash: envelope.reportHash }));
