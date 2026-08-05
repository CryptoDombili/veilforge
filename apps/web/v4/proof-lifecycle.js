import { deepFreeze } from './canonical.js';
import { webV4Error } from './errors.js';
import { safeTransactionRequest } from './proof-adapter.js';

export const WEB_PROOF_STATES = Object.freeze([
  'unavailable', 'report-unverified', 'ready', 'incomplete-warning', 'wallet-not-connected',
  'wrong-network', 'preflight-checking', 'preflight-failed', 'ready-to-publish',
  'user-rejected', 'cancelled', 'timeout', 'pending', 'confirmed', 'reverted',
  'receipt-invalid', 'already-published',
]);

const TX_HASH = /^0x[0-9a-f]{64}$/u;

export function proofLifecycleState(status, details = {}) {
  if (!WEB_PROOF_STATES.includes(status)) throw webV4Error('WEB_V4_PROOF_PREFLIGHT_FAILED', 'Unknown proof lifecycle state.');
  return deepFreeze({ status, ...details });
}

export async function simulateTransactionBoundary(transactionRequest, scenario = 'pending', options = {}) {
  safeTransactionRequest(transactionRequest, options.networkKey);
  if (scenario === 'user-rejected') return proofLifecycleState('user-rejected', { errorCode: 'WEB_V4_USER_REJECTED' });
  if (scenario === 'timeout') return proofLifecycleState('timeout', { errorCode: 'WEB_V4_TIMEOUT' });
  if (scenario === 'wallet-unavailable') return proofLifecycleState('unavailable', { errorCode: 'WEB_V4_PROVIDER_UNAVAILABLE' });
  if (scenario === 'wrong-network') return proofLifecycleState('wrong-network', { errorCode: 'WEB_V4_WRONG_NETWORK' });
  if (scenario === 'cancelled') return proofLifecycleState('cancelled');
  if (scenario === 'revert') return proofLifecycleState('reverted', { errorCode: 'WEB_V4_RECEIPT_REVERTED' });
  const transactionHash = String(options.transactionHash ?? `0x${'ab'.repeat(32)}`).toLowerCase();
  if (!TX_HASH.test(transactionHash)) return proofLifecycleState('receipt-invalid', { errorCode: 'WEB_V4_TX_INVALID' });
  if (scenario === 'pending') return proofLifecycleState('pending', { transactionHash });
  if (scenario === 'success') return proofLifecycleState('pending', { transactionHash, receipt: options.receipt ?? null });
  throw webV4Error('WEB_V4_PROOF_PREFLIGHT_FAILED', 'Unsupported transaction simulation scenario.');
}
