import { deepFreeze, sha256Digest } from './canonical.js';
import { safeTransactionRequest, verifyWebProofEnvelope } from './proof-adapter.js';

export const WEB_PROOF_SEND_ENABLED = false;

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
  check('network-preflight-passed', networkPreflight?.passed === true, networkPreflight?.passed === true ? 'Arc Testnet read-only preflight passed.' : 'Arc Testnet read-only preflight did not pass.');
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
    status: blockingReasons.length ? 'review-blocked' : 'review-ready-send-disabled',
    reviewReady: blockingReasons.length === 0,
    sendEnabled: WEB_PROOF_SEND_ENABLED,
    sendDisabledReason: existingProofPath ? 'This proof is already published; a second transaction is blocked.' : 'Transaction sending is disabled in this preflight build.',
    checks, blockingReasons, transactionDigest,
  });
}
