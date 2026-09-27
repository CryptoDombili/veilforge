import { deepFreeze, sha256Digest } from './canonical.js';
import { safeTransactionRequest, verifyWebProofEnvelope } from './proof-adapter.js';
import { assertProofNetworkCapability, assertTrustedNetwork, DEFAULT_PROOF_NETWORK, resolveProofNetwork } from '../../../packages/proof/v4/network.js';

// Compatibility capability flag. The lower-level trusted decision remains mandatory.
export const WEB_PROOF_SEND_ENABLED = true;

export function assertTrustedProofSend({ networkKey = DEFAULT_PROOF_NETWORK, providerChainId, registryAddress, transactionRequest, userApproved = false } = {}) {
  if (userApproved !== true) throw new Error('Explicit user approval is required.');
  const network = assertTrustedNetwork({ networkKey, providerChainId, registryAddress, operation: 'publish' });
  const request = safeTransactionRequest(transactionRequest, network.networkKey);
  if (request.to.toLowerCase() !== network.registryAddress.toLowerCase()) throw new Error('Transaction target is not the trusted registry.');
  return network;
}

export async function createUserGatedProofReview({ envelope, preflight, networkPreflight, existingProofVerified = false, disclosureAcknowledged = false, userGesture = false, reviewAcknowledged = false, currentStateBindingDigest = null } = {}) {
  const checks = [];
  const check = (id, passed, message) => { checks.push(deepFreeze({ id, passed, applicable: true, severity: 'blocking', message })); return passed; };
  const notRequired = (id, message) => { checks.push(deepFreeze({ id, passed: false, applicable: false, severity: 'informational', message })); };
  let envelopeVerified = false;
  try { envelopeVerified = await verifyWebProofEnvelope(envelope); } catch { /* fail closed */ }
  check('envelope-verified', envelopeVerified, envelopeVerified ? 'Proof envelope is verified.' : 'Proof envelope is invalid.');
  const existingProofPath = existingProofVerified === true && preflight?.status === 'already-published' && preflight?.transactionRequest == null && networkPreflight?.passed === true && networkPreflight?.duplicate === true;
  const newTransactionPath = preflight?.status === 'ready-to-publish';
  if (existingProofPath) notRequired('publish-preflight-passed', 'Not applicable — existing proof verified.');
  else check('publish-preflight-passed', newTransactionPath, newTransactionPath ? 'Publish preflight passed.' : 'Publish preflight is not ready.');
  const network = resolveProofNetwork(envelope?.networkKey ?? DEFAULT_PROOF_NETWORK);
  let networkPublishEnabled = false;
  try { assertProofNetworkCapability(network.networkKey, 'publish'); networkPublishEnabled = true; } catch { /* fail closed */ }
  check('network-publish-enabled', networkPublishEnabled, networkPublishEnabled ? `${network.chainName} publishing is enabled.` : `${network.chainName} publishing is disabled or unresolved.`);
  check('network-preflight-passed', networkPreflight?.passed === true, networkPreflight?.passed === true ? `${network.chainName} read-only preflight passed.` : `${network.chainName} read-only preflight did not pass.`);
  check('user-gesture', userGesture === true, userGesture === true ? 'Review was opened by an explicit user gesture.' : 'Explicit user gesture is required.');
  check('review-acknowledged', reviewAcknowledged === true, reviewAcknowledged === true ? 'Transaction review was acknowledged.' : 'Transaction review acknowledgement is required.');
  check('incomplete-disclosure', envelope?.complete === true || disclosureAcknowledged === true, envelope?.complete === true || disclosureAcknowledged === true ? 'Completeness disclosure is satisfied.' : 'Incomplete analysis disclosure is required.');
  const bindingCurrent = Boolean(networkPreflight?.stateBindingDigest) && currentStateBindingDigest === networkPreflight.stateBindingDigest;
  check('state-binding-current', bindingCurrent, bindingCurrent ? 'Account, chain, registry code and registry state binding is current.' : 'Preflight state binding is stale.');
  let transactionDigest = null;
  if (existingProofPath) notRequired('transaction-request-safe', 'Not required — no transaction request is permitted for an existing proof.');
  else {
    try { transactionDigest = await sha256Digest(safeTransactionRequest(preflight?.transactionRequest, envelope?.networkKey)); }
    catch { check('transaction-request-safe', false, 'Transaction request is invalid or tampered.'); }
    if (transactionDigest) check('transaction-request-safe', true, 'Transaction request is deterministic and trusted.');
  }
  const blockingReasons = checks.filter((item) => item.applicable !== false && !item.passed).map((item) => item.id);
  return deepFreeze({
    status: blockingReasons.length ? 'review-blocked' : 'review-ready',
    reviewReady: blockingReasons.length === 0,
    sendEnabled: blockingReasons.length === 0 && !existingProofPath,
    sendDisabledReason: existingProofPath ? 'This proof is already published; a second transaction is blocked.' : blockingReasons.length ? 'The trusted send decision did not pass.' : null,
    checks, blockingReasons, transactionDigest,
  });
}
