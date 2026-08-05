import { deepFreeze } from './canonical.js';
import { webV4Error } from './errors.js';
import { classifyProviderError, normalizeAccounts } from './proof-wallet.js';

export async function connectWalletOnUserGesture(provider, { userGesture = false, timeoutMs = 30_000 } = {}) {
  if (userGesture !== true) throw webV4Error('WEB_V4_USER_GESTURE_REQUIRED', 'Wallet connection requires an explicit user gesture.');
  if (!provider?.request) throw webV4Error('WEB_V4_PROVIDER_UNAVAILABLE', 'No EIP-1193 provider is available.');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 30_000) throw webV4Error('WEB_V4_PROOF_PREFLIGHT_FAILED', 'Wallet connection timeout is invalid.');
  let timer;
  try {
    const accounts = await Promise.race([
      Promise.resolve().then(() => provider.request({ method: 'eth_requestAccounts' })),
      new Promise((_, reject) => { timer = setTimeout(() => reject(webV4Error('WEB_V4_TIMEOUT', 'Wallet connection timed out.')), timeoutMs); }),
    ]);
    const normalized = normalizeAccounts(accounts);
    if (!normalized.length) throw webV4Error('WEB_V4_ACCOUNT_UNAVAILABLE', 'The wallet returned no account.');
    return deepFreeze({ connected: true, account: normalized[0], accounts: normalized, userGestureConfirmed: true });
  } catch (error) {
    if (error?.code?.startsWith?.('WEB_V4_')) throw error;
    const classified = classifyProviderError(error);
    throw webV4Error(classified.code, 'The user-gated wallet connection did not complete.');
  } finally { clearTimeout(timer); }
}
