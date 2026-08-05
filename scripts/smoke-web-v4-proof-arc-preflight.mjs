import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PUBLISH_REPORT_SELECTOR } from '../packages/proof/src/registry.js';
import { report } from '../tests/v4/report/helpers.mjs';

const root = process.cwd();
const preview = path.join(root, 'dist-preview-v4');
if (!fs.existsSync(path.join(preview, 'v4', 'proof-network-preflight.js'))) throw new Error('V4 preview proof preflight module is missing.');
if (!/WEB_V4_ENABLED = true/u.test(fs.readFileSync(path.join(preview, 'config.js'), 'utf8'))) throw new Error('V4 preview feature flag is not enabled in the isolated preview build.');

const imported = async (file) => import(`${pathToFileURL(path.join(preview, 'v4', file)).href}?smoke=${Date.now()}`);
const { verifyV4Report } = await imported('report-adapter.js');
const { createWebProofEnvelope, prepareWebRegistryPublish } = await imported('proof-adapter.js');
const { preflightArcTestnetProvider, REGISTRY_GET_LATEST_REPORT_SELECTOR, REGISTRY_HAS_REPORT_SELECTOR } = await imported('proof-network-preflight.js');
const { createUserGatedProofReview, WEB_PROOF_SEND_ENABLED } = await imported('proof-send-boundary.js');

const account = '0x1111111111111111111111111111111111111111';
const verification = await verifyV4Report(report());
const envelope = await createWebProofEnvelope(verification);
const walletState = { providerAvailable: true, connected: true, account, accounts: [account], chainId: envelope.chainId };
const preflight = await prepareWebRegistryPublish({ verification, envelope, walletState, disclosureAcknowledged: true });
const calls = [];
const provider = {
  async request(request) {
    calls.push(request.method);
    if (request.method === 'eth_chainId') return '0x4cef52';
    if (request.method === 'eth_getCode') return `0x6000${PUBLISH_REPORT_SELECTOR.slice(2)}6000`;
    if (request.method === 'eth_blockNumber') return '0x100';
    if (request.method === 'eth_estimateGas') return '0x1d4c0';
    if (request.method === 'eth_call') {
      const data = String(request.params?.[0]?.data ?? '').toLowerCase();
      if (data.startsWith(REGISTRY_HAS_REPORT_SELECTOR.toLowerCase())) return `0x${'0'.repeat(64)}`;
      if (data.startsWith(REGISTRY_GET_LATEST_REPORT_SELECTOR.toLowerCase())) return '0x';
      return '0x';
    }
    throw new Error('Unexpected provider method.');
  },
};
const networkPreflight = await preflightArcTestnetProvider({ provider, envelope, transactionRequest: preflight.transactionRequest, payload: preflight.payload });
const review = await createUserGatedProofReview({ envelope, preflight, networkPreflight, disclosureAcknowledged: true, userGesture: true, reviewAcknowledged: true, currentStateBindingDigest: networkPreflight.stateBindingDigest });
if (!networkPreflight.passed || !review.reviewReady || review.sendEnabled || WEB_PROOF_SEND_ENABLED || calls.some((method) => !['eth_chainId', 'eth_getCode', 'eth_blockNumber', 'eth_call', 'eth_estimateGas'].includes(method))) throw new Error('V4 preview Arc proof preflight smoke failed.');

console.log(JSON.stringify({ passed: true, preview: true, readOnlyMethods: [...new Set(calls)], preflightStatus: networkPreflight.status, reviewStatus: review.status, sendEnabled: review.sendEnabled, transactionSent: false }));
